#!/usr/bin/env node
/**
 * CDK app for shoebox.idfkit.com.
 *
 * The stack is pinned to us-east-1 because CloudFront will only accept an ACM
 * certificate issued there. The account comes from the ambient credentials
 * rather than a literal, so this file carries no account number into a public
 * repository. The hosted zone is looked up, which is why the account must be
 * concrete: `HostedZone.fromLookup` cannot run against an environment-agnostic
 * stack.
 */
import * as cdk from 'aws-cdk-lib';
import { ShoeboxStack } from '../lib/shoebox-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID;
if (!account) {
  throw new Error(
    'No AWS account in the environment. Run through the AWS CLI with credentials configured, ' +
      'or set AWS_ACCOUNT_ID. The hosted zone lookup cannot run without a concrete account.',
  );
}

/**
 * Overridable, but only one value actually works: CloudFront will accept an ACM
 * certificate from us-east-1 and nowhere else, so moving this moves the
 * certificate somewhere the distribution cannot use it. It is a variable rather
 * than a literal so nothing about the deployment is baked into a public
 * repository, not because the choice is free.
 */
const region = process.env.SHOEBOX_REGION ?? 'us-east-1';

new ShoeboxStack(app, 'ShoeboxStack', {
  env: { account, region },
  domainName: app.node.tryGetContext('domainName') ?? 'shoebox.idfkit.com',
  zoneName: app.node.tryGetContext('zoneName') ?? 'idfkit.com',
  githubRepo: app.node.tryGetContext('githubRepo') ?? 'idfkit/idfkit-shoebox',
  githubBranch: app.node.tryGetContext('githubBranch') ?? 'main',
  // Not secrets: any GitHub user can read these off the public API. They are
  // here because the OIDC subject claim carries ids rather than names, and
  // trusting an id is what stops a released repository name from carrying the
  // trust with it. `gh api /repos/OWNER/REPO --jq '.id, .owner.id'`
  githubOwnerId: app.node.tryGetContext('githubOwnerId') ?? '262897602',
  githubRepoId: app.node.tryGetContext('githubRepoId') ?? '1334309807',
  // Context arrives from the CLI as a string, so `-c createOidcProvider=false`
  // has to be compared as one.
  createOidcProvider: String(app.node.tryGetContext('createOidcProvider') ?? 'true') !== 'false',
  description: 'Static hosting and weather proxy for shoebox.idfkit.com',
});
