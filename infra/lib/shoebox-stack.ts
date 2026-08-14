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
  /** `owner/repo`, used to scope which workflow may assume the deploy role. */
  readonly githubRepo: string;
  /** Only this branch may deploy. */
  readonly githubBranch: string;
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

/**
 * GitHub's OIDC issuer already has a provider in this account, created by an
 * earlier stack. IAM allows exactly one provider per issuer URL, so creating a
 * second here would fail the deploy with `EntityAlreadyExists`. It is imported
 * by ARN instead, which also means this stack never owns it and cannot delete
 * it out from under whatever else is trusting it.
 */
const GITHUB_OIDC_ISSUER = 'token.actions.githubusercontent.com';

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
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubOidc',
      `arn:aws:iam::${this.account}:oidc-provider/${GITHUB_OIDC_ISSUER}`,
    );

    const deployRole = new iam.Role(this, 'DeployRole', {
      // The `sub` condition is the whole security boundary: without it any
      // GitHub Actions workflow in the world could assume this role. It is
      // pinned to one repository and one branch, so a pull request from a fork
      // cannot reach the bucket.
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: { [`${GITHUB_OIDC_ISSUER}:aud`]: 'sts.amazonaws.com' },
        StringLike: {
          [`${GITHUB_OIDC_ISSUER}:sub`]: `repo:${props.githubRepo}:ref:refs/heads/${props.githubBranch}`,
        },
      }),
      description: `Publishes ${props.domainName} from ${props.githubRepo}`,
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
