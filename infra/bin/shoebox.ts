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

new ShoeboxStack(app, 'ShoeboxStack', {
  env: { account, region: 'us-east-1' },
  domainName: app.node.tryGetContext('domainName') ?? 'shoebox.idfkit.com',
  zoneName: app.node.tryGetContext('zoneName') ?? 'idfkit.com',
  githubRepo: app.node.tryGetContext('githubRepo') ?? 'idfkit/idfkit-shoebox',
  githubBranch: app.node.tryGetContext('githubBranch') ?? 'main',
  description: 'Static hosting and weather proxy for shoebox.idfkit.com',
});
