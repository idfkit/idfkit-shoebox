import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ShoeboxStackProps extends cdk.StackProps {
  /** The name the sheet is served under. */
  readonly domainName: string;
  /** The Route 53 zone that name sits in. Looked up, not created. */
  readonly zoneName: string;
  /** `owner/repo`, for the role description. */
  readonly githubRepo: string;
  /**
   * The branch that publishes the development channel. A release comes from a
   * tag rather than from any branch; see `RELEASE_TAGS`.
   */
  readonly githubBranch: string;
  /**
   * GitHub's numeric organisation and repository ids, which appear in the OIDC
   * subject claim and are what actually scopes the role.
   *
   * GitHub issues an *immutable* subject, `repo:owner@ownerId/repo@repoId:ref:...`,
   * rather than the `repo:owner/repo:ref:...` form its documentation shows. That
   * is the point of the feature: a name can be released and claimed by someone
   * else, an id cannot, so trusting the ids means a deleted or renamed
   * repository cannot hand this role to whoever takes the name next. Read them
   * from `gh api /repos/OWNER/REPO --jq .id` and `.owner.id`.
   */
  readonly githubOwnerId: string;
  readonly githubRepoId: string;
  /**
   * Whether to create the GitHub OIDC provider. IAM allows exactly one per
   * issuer URL per account, so this is a property of the target account rather
   * than a fixed choice: true for an account that has never run a GitHub
   * Actions deploy, false for one that already has a provider. Wrong in either
   * direction the deploy fails by name, with `EntityAlreadyExists` on a
   * duplicate, so neither mistake is silent.
   */
  readonly createOidcProvider: boolean;
}

/**
 * The upstream the weather picker reads, and the prefix that stands in for it.
 *
 * climate.onebuilding.org sends no `Access-Control-Allow-Origin`, so a page
 * cannot fetch the TMYx archives directly. `src/weather.js` therefore rewrites
 * every archive URL to a same-origin `/onebuilding/...` path, and something has
 * to put the origin back. In development that something is the Vite proxy in
 * `vite.config.js`; in production it is the second origin below plus the
 * function that strips the prefix. Keeping the two arrangements identical in
 * shape is deliberate: a picker that works on localhost and 404s in production
 * is the failure this whole behavior exists to prevent.
 */
const UPSTREAM = 'climate.onebuilding.org';
const PREFIX = '/onebuilding';

/** GitHub's OIDC issuer. See `createOidcProvider` for why it is not always created. */
const GITHUB_OIDC_ISSUER = 'token.actions.githubusercontent.com';

/**
 * The tags that publish the site itself, as the glob the trust policy matches.
 *
 * It has to agree with the `tags:` filter in `.github/workflows/deploy.yml`: a
 * tag the workflow runs on but the role does not trust fails at the credentials
 * step with `Not authorized to perform sts:AssumeRoleWithWebIdentity`, which
 * names neither file. Widening it to every tag would not widen the trust in any
 * real sense — pushing a tag to this repository already takes the write access
 * that pushing to `main` takes — so the narrowing is only worth what it says
 * about intent: a release is a `v`-prefixed tag and nothing else.
 */
const RELEASE_TAGS = 'v*';

/**
 * Everything that is not a release is published into the same bucket, one
 * directory in: the development channel every push to `main` publishes at
 * `${domainName}/dev/`, and a pull request's preview at `${domainName}/42/`.
 * The site's own address carries a tagged release and nothing else.
 *
 * One namespace rather than a second distribution, because the point of both is
 * to exercise the real arrangement: the same TLS, the same cache policy, and
 * above all the same `/onebuilding` origin, which is the piece that cannot be
 * tested on localhost and is exactly where a deployment breaks. A release is
 * then the same artefact that has been served under `/dev/` since it was
 * merged, moved to the root.
 *
 * A top-level `dev`, and a top-level directory of digits, are therefore
 * reserved. `scripts/deploy.mjs` knows this from both ends: publishing a
 * release leaves keys matching this shape alone rather than pruning them as
 * leftovers, and refuses outright to build one, while publishing a channel
 * touches nothing outside its own.
 */
const CHANNEL = /^\/(\d+|dev)(\/.*)?$/;

/**
 * The exact `sub` claim GitHub sends, which is the whole security boundary:
 * without it any Actions workflow anywhere could assume this role.
 *
 * Verified against a real token rather than taken from the documentation, which
 * still describes the older `repo:owner/repo:ref:...` shape. The observed claim
 * is `repo:idfkit@262897602/idfkit-shoebox@1334309807:ref:refs/heads/main`, and
 * a policy written to the documented form is refused with "Not authorized to
 * perform sts:AssumeRoleWithWebIdentity".
 */
const repository = (p: { githubRepo: string; githubOwnerId: string; githubRepoId: string }) => {
  const [owner, repo] = p.githubRepo.split('/');
  return `repo:${owner}@${p.githubOwnerId}/${repo}@${p.githubRepoId}`;
};

const subject = (p: {
  githubRepo: string;
  githubBranch: string;
  githubOwnerId: string;
  githubRepoId: string;
}) => `${repository(p)}:ref:refs/heads/${p.githubBranch}`;

/**
 * The subject a workflow running on a tag push is issued, which is what lets a
 * release reach the root of the bucket. A tag ref is not a branch ref, so the
 * subject above does not cover it and a release would otherwise be refused by
 * STS — the whole arrangement failing at its one interesting moment.
 */
const releaseSubject = (p: {
  githubRepo: string;
  githubOwnerId: string;
  githubRepoId: string;
}) => `${repository(p)}:ref:refs/tags/${RELEASE_TAGS}`;

/**
 * The subject a workflow running on the `pull_request` event is issued, which
 * is what lets the preview job reach the bucket. GitHub does not put the head
 * ref in it — every pull request in the repository shares this one claim — so
 * it cannot be narrowed further here and the narrowing lives upstream instead:
 *
 *   - a pull request from a fork is issued a read-only token whatever the
 *     workflow's `permissions` say, so `id-token: write` is never granted and
 *     no token is minted at all;
 *   - `.github/workflows/preview.yml` additionally refuses to run unless the
 *     head branch is in this repository, which takes a person with write access
 *     to reach — someone who could push to `main` regardless.
 *
 * So this widens the role to the repository's collaborators, and no further.
 * The alternative, `pull_request_target`, would run the base branch's workflow
 * with a writable token against a fork's code, and is exactly the arrangement
 * this avoids.
 */
const previewSubject = (p: {
  githubRepo: string;
  githubOwnerId: string;
  githubRepoId: string;
}) => `${repository(p)}:pull_request`;

export class ShoeboxStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ShoeboxStackProps) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.zoneName });

    // The bucket is never public. CloudFront reaches it through Origin Access
    // Control, so the only route to an object is through the distribution and
    // its TLS certificate.
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Retained on purpose: `cdk destroy` should not be able to take the
      // published site with it. Emptying and removing the bucket is a
      // deliberate, manual act.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // CloudFront's certificate must live in us-east-1; the stack is pinned
    // there for that reason alone (see bin/shoebox.ts).
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // The mirror image of the Vite proxy's `rewrite`. CloudFront cannot strip a
    // path prefix on its own — an origin path is prepended, never removed — so
    // this runs on the viewer request and does it directly.
    const stripPrefix = new cloudfront.Function(this, 'StripOnebuildingPrefix', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
    var request = event.request;
    request.uri = request.uri.replace(/^\\/onebuilding/, '');
    if (request.uri.charAt(0) !== '/') {
        request.uri = '/' + request.uri;
    }
    return request;
}
`),
    });

    /**
     * What makes `/dev/`, `/42/` and their bare forms reach a channel's own
     * `index.html`.
     *
     * `defaultRootObject` covers exactly one path, `/`, so it does nothing for a
     * subdirectory: S3 has no key named `dev/` and answers the request with an
     * error. This appends the index where the browser asked for a directory,
     * and redirects the bare `/dev` to `/dev/` so that the channel's own base is
     * unambiguous rather than resolving one level up.
     *
     * The pattern is interpolated from `CHANNEL` rather than written out again,
     * because a channel served at a path the deploy script does not consider
     * reserved would be pruned by the next release — a failure that appears
     * hours later and nowhere near this file.
     *
     * The construct id still says `Preview`, from when a pull request was the
     * only thing this served. Renaming it would replace the function for no
     * behavioural gain, which is a distribution update this file has no reason
     * to ask for.
     */
    const channelIndex = new cloudfront.Function(this, 'PreviewIndex', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
    var request = event.request;
    var channel = request.uri.match(${CHANNEL});
    if (!channel) {
        return request;
    }
    if (!channel[2]) {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: { location: { value: '/' + channel[1] + '/' } }
        };
    }
    if (channel[2].charAt(channel[2].length - 1) === '/') {
        request.uri = request.uri + 'index.html';
    }
    return request;
}
`),
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${props.domainName} — EnergyPlus in the browser`,
      defaultRootObject: 'index.html',
      domainNames: [props.domainName],
      certificate,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // `compress` is left on for the small files, but it is not what keeps
        // the engine download honest: CloudFront only compresses objects
        // between 1 KB and 10 MB, and only for content types on its own list.
        // The WASM binary (28.40 MiB) and the schema (9.88 MiB) are both above
        // that ceiling, and S3 serves `.idd` as `application/octet-stream`,
        // which is not on the list at all. `scripts/deploy.mjs` therefore
        // compresses everything itself and uploads it with `Content-Encoding`,
        // so what ships does not depend on this flag's heuristics.
        compress: true,
        functionAssociations: [
          { function: channelIndex, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        [`${PREFIX}/*`]: {
          origin: new origins.HttpOrigin(UPSTREAM, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          functionAssociations: [
            { function: stripPrefix, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
          ],
        },
      },
    });

    const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, 'AliasRecord', { zone, recordName: props.domainName, target });
    new route53.AaaaRecord(this, 'AliasRecordV6', { zone, recordName: props.domainName, target });

    // ── Deploying from GitHub Actions, without a stored key ──────────────
    const provider = props.createOidcProvider
      ? new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
          url: `https://${GITHUB_OIDC_ISSUER}`,
          clientIds: ['sts.amazonaws.com'],
        })
      : iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubOidc',
          `arn:aws:iam::${this.account}:oidc-provider/${GITHUB_OIDC_ISSUER}`,
        );

    const deployRole = new iam.Role(this, 'DeployRole', {
      // The `sub` condition is the whole security boundary: without it any
      // GitHub Actions workflow in the world could assume this role. It is
      // pinned to this repository, on its development branch, on a release tag,
      // or on a pull request raised within it — three patterns matched as a
      // list, so a workflow in another repository cannot reach the bucket and
      // neither can a fork. See `previewSubject` for why the last one is as
      // narrow as it gets.
      // Only the immutable form is accepted. Allowing the documented
      // `repo:owner/repo:...` form alongside it would quietly restore exactly
      // the weakness the immutable claim removes, so if GitHub ever changes
      // what it sends this fails loudly instead of widening the trust.
      //
      // `StringLike` rather than `StringEquals` because the release pattern
      // carries a wildcard and IAM will not apply two operators to one
      // condition key. The other two patterns contain no wildcard, and
      // `StringLike` matches such a pattern exactly, so nothing is widened by
      // the operator itself.
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          [`${GITHUB_OIDC_ISSUER}:aud`]: 'sts.amazonaws.com',
        },
        StringLike: {
          [`${GITHUB_OIDC_ISSUER}:sub`]: [
            subject(props),
            releaseSubject(props),
            previewSubject(props),
          ],
        },
      }),
      description: `Publishes ${props.domainName} and its channels from ${props.githubRepo}`,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    bucket.grantReadWrite(deployRole);
    bucket.grantDelete(deployRole);

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        ],
      }),
    );

    // `scripts/deploy.mjs` reads the bucket name and distribution id off this
    // stack rather than taking them as arguments, so there is one place where
    // they are true and no chance of publishing into last week's bucket.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [this.stackId],
      }),
    );

    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${props.domainName}` });
  }
}
