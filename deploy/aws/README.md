# SG/Send AWS Deployment Templates

CloudFormation templates for running your own SG/Send server. One image
(`sg-send-vault`, Docker Hub / ECR), three runtime shapes. Architecture and decisions:
`team/roles/architect/reviews/08/11/v0.33.54__architect-spec__multi-target-deployment.md` (ADR-1..16).

| Template | Shape | Use when |
|---|---|---|
| `lambda.cfn.yml` | Serverless (container-image Lambda + Function URL) | pay-per-request, scales to zero |
| `ec2.cfn.yml` | Single-instance appliance (app + caddy auto-TLS) | your own domain, disk storage, always-on |
| `ecs-fargate.cfn.yml` | Cluster behind an ALB (own VPC, full lifecycle) | long-running, multi-replica |
| `ami-pipeline.cfn.yml` | Image Builder pipeline that bakes the appliance AMI | producing the master EC2/Marketplace artifact |

## Shared conventions

- **`AccessToken`** — the deployment's access key (licensing key). Gates **all** routes,
  including reads. Provided at launch, **never stored by the stack** — manage it in GitHub
  Actions Secrets, an SG/Vault, or your password manager. Empty = explicitly open instance.
  *EC2 caveat:* the token passes through instance user-data — visible to IAM principals with
  `ec2:DescribeInstanceAttribute` in your account; rotate via stack update.
- **`StorageMode`** — `s3` (durable; bucket named `{account}--sgraph-send-transfers--{region}`
  unless you pass an existing bucket) · `disk` (EC2 only; EBS volume, **snapshot on stack
  delete**) · `memory` (ephemeral by design — agentic/demo workloads; no storage resources,
  no storage IAM).
- **DNS** — Lambda needs the CloudFront trio (`DomainName`+`HostedZoneId`+`CertificateArn`,
  cert in **us-east-1**); Fargate uses an in-region cert on the ALB; EC2 needs no cert at
  all (caddy gets its own from Let's Encrypt).

## Quick start

```bash
# Serverless (needs the image in YOUR ECR — see note below)
aws cloudformation deploy --template-file lambda.cfn.yml \
  --stack-name sg-send-lambda --capabilities CAPABILITY_IAM \
  --parameter-overrides ImageUri=<acct>.dkr.ecr.<region>.amazonaws.com/sg-send-vault:latest \
                        AccessToken=$(openssl rand -hex 32)

# Appliance with your own domain
aws cloudformation deploy --template-file ec2.cfn.yml \
  --stack-name sg-send-box --capabilities CAPABILITY_IAM \
  --parameter-overrides DomainName=send.example.com HostedZoneId=Z... \
                        AccessToken=$(openssl rand -hex 32)

# Fargate cluster
aws cloudformation deploy --template-file ecs-fargate.cfn.yml \
  --stack-name sg-send-cluster --capabilities CAPABILITY_IAM \
  --parameter-overrides AccessToken=$(openssl rand -hex 32)
```

Then: open the `PublicUrl` output → sign in with your access key → or
`sgit clone <vault-key> --endpoint <PublicUrl> --token <access-key>`.

**Lambda image note:** Lambda requires the image in a same-account ECR repo:

```bash
aws ecr create-repository --repository-name sg-send-vault
docker pull diniscruz/sg-send-vault:latest
docker tag diniscruz/sg-send-vault:latest <acct>.dkr.ecr.<region>.amazonaws.com/sg-send-vault:latest
aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.<region>.amazonaws.com
docker push <acct>.dkr.ecr.<region>.amazonaws.com/sg-send-vault:latest
```

## Teardown & data recovery

`aws cloudformation delete-stack --stack-name <name>` removes everything the stack created,
**except**: S3 buckets are retained (your ciphertext survives; empty + delete them yourself
if you mean it), and the EC2 data volume becomes an **EBS snapshot** — restore by creating a
volume from it and attaching to a new stack's instance. Fargate delete removes the whole
footprint including VPC and ALB.

## Status

These templates are new (Aug 2026) and lint-clean (`cfn-lint`); live-account validation runs
in the `deploy-full-cycle` pipeline. Treat as **beta until that pipeline is green** — check
`team/roles/librarian/reality/infra/` for current verified status.
