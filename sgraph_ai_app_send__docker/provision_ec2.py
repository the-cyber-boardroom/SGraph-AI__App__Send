#!/usr/bin/env python3
"""sg-send-ec2 — Provision and manage SGraph Send on EC2 (Docker-based).

Modelled on the Playwright service provisioner. Single file, Typer CLI.
Requires: pip install typer boto3 requests
"""
import json
import os
import secrets
import subprocess
import sys
import time

import boto3
import requests
import typer

app = typer.Typer(name='sg-send-ec2', help='Provision and manage SGraph Send EC2 instances')

# ─── Constants ──────────────────────────────────────────────────────────────────

EC2__INSTANCE_TYPE       = 't3.large'
EC2__SEND_PORT           = 8080

IAM__ROLE_NAME           = 'sg-send-ec2'
IAM__INSTANCE_PROFILE    = 'sg-send-ec2'
IAM__POLICY_ARNS         = ('arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly',
                            'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'       )

SG__NAME                 = 'sg-send-ec2'

TAG__SERVICE_KEY         = 'sg:service'
TAG__SERVICE_VALUE       = 'sg-send-ec2'
TAG__DEPLOY_NAME_KEY     = 'sg:deploy-name'
TAG__CREATOR_KEY         = 'sg:creator'
TAG__ACCESS_TOKEN_KEY    = 'sg:access-token'

ECR__REPO_NAME           = 'sg-send'

_ADJECTIVES = ['bold','bright','calm','clever','cool','crisp','eager','fast',
               'firm','glad','keen','kind','neat','pure','safe','sharp','slim',
               'smart','soft','swift','true','warm','wise','vivid','fresh']
_SCIENTISTS = ['bohr','curie','darwin','dirac','euler','fermi','gauss','hopper',
               'kepler','lorenz','maxwell','newton','planck','turing','volta',
               'watt','tesla','faraday','hubble','noether','ramanujan','shannon',
               'lovelace','hawking','feynman']


# ─── AWS Helpers ────────────────────────────────────────────────────────────────

def aws_account_id() -> str:
    return boto3.client('sts').get_caller_identity()['Account']

def aws_region() -> str:
    session = boto3.session.Session()
    return session.region_name or os.environ.get('AWS_DEFAULT_REGION', 'eu-west-2')

def ecr_registry_host() -> str:
    return f'{aws_account_id()}.dkr.ecr.{aws_region()}.amazonaws.com'

def default_image_uri() -> str:
    return f'{ecr_registry_host()}/{ECR__REPO_NAME}:latest'

def generate_deploy_name() -> str:
    return f'{secrets.choice(_ADJECTIVES)}-{secrets.choice(_SCIENTISTS)}'

def generate_access_token() -> str:
    return secrets.token_urlsafe(32)


# ─── IAM ────────────────────────────────────────────────────────────────────────

def ensure_instance_profile():
    iam = boto3.client('iam')

    try:
        iam.get_role(RoleName=IAM__ROLE_NAME)
    except iam.exceptions.NoSuchEntityException:
        trust_policy = json.dumps({
            'Version': '2012-10-17',
            'Statement': [{'Effect': 'Allow',
                           'Principal': {'Service': 'ec2.amazonaws.com'},
                           'Action': 'sts:AssumeRole'}]
        })
        iam.create_role(RoleName=IAM__ROLE_NAME, AssumeRolePolicyDocument=trust_policy,
                        Description='SGraph Send EC2 instance role')
        for arn in IAM__POLICY_ARNS:
            iam.attach_role_policy(RoleName=IAM__ROLE_NAME, PolicyArn=arn)

    try:
        iam.get_instance_profile(InstanceProfileName=IAM__INSTANCE_PROFILE)
    except iam.exceptions.NoSuchEntityException:
        iam.create_instance_profile(InstanceProfileName=IAM__INSTANCE_PROFILE)
        iam.add_role_to_instance_profile(InstanceProfileName=IAM__INSTANCE_PROFILE,
                                         RoleName=IAM__ROLE_NAME)
        time.sleep(10)


# ─── Security Group ─────────────────────────────────────────────────────────────

def ensure_security_group() -> str:
    ec2 = boto3.client('ec2')
    try:
        result = ec2.describe_security_groups(Filters=[{'Name': 'group-name', 'Values': [SG__NAME]}])
        if result['SecurityGroups']:
            return result['SecurityGroups'][0]['GroupId']
    except Exception:
        pass

    vpc_id = ec2.describe_vpcs(Filters=[{'Name': 'is-default', 'Values': ['true']}])['Vpcs'][0]['VpcId']
    sg = ec2.create_security_group(GroupName=SG__NAME,
                                   Description='SGraph Send EC2 — port 8080 inbound',
                                   VpcId=vpc_id)
    sg_id = sg['GroupId']
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[{'IpProtocol': 'tcp', 'FromPort': EC2__SEND_PORT,
                        'ToPort': EC2__SEND_PORT, 'IpRanges': [{'CidrIp': '0.0.0.0/0'}]}])
    return sg_id


# ─── AMI Lookup ─────────────────────────────────────────────────────────────────

def latest_al2023_ami() -> str:
    ec2 = boto3.client('ec2')
    images = ec2.describe_images(
        Owners=['amazon'],
        Filters=[{'Name': 'name',         'Values': ['al2023-ami-2023*-x86_64']},
                 {'Name': 'state',        'Values': ['available']              },
                 {'Name': 'architecture', 'Values': ['x86_64']                 }])
    sorted_images = sorted(images['Images'], key=lambda x: x['CreationDate'], reverse=True)
    return sorted_images[0]['ImageId']


# ─── User Data ──────────────────────────────────────────────────────────────────

USER_DATA_TEMPLATE = """#!/bin/bash
set -euxo pipefail
exec > >(tee /var/log/sg-send-setup.log | logger -t sg-send) 2>&1

dnf install -y docker
systemctl enable --now docker

usermod -aG docker ssm-user 2>/dev/null || true

set +x
aws ecr get-login-password --region {region} \\
    | docker login --username AWS --password-stdin {registry}
set -x

docker pull {image_uri}

docker logout {registry}
rm -f /root/.docker/config.json

docker run -d \\
  --name sg-send \\
  --restart always \\
  -p {port}:{port} \\
  -v /data:/data \\
  -e SEND__STORAGE_MODE=disk \\
  -e SEND__DISK_PATH=/data \\
  -e SGRAPH_SEND__ACCESS_TOKEN="{access_token}" \\
  {image_uri}

echo "=== setup complete at $(date) ==="
"""


def render_user_data(image_uri: str, access_token: str) -> str:
    return USER_DATA_TEMPLATE.format(
        region       = aws_region()      ,
        registry     = ecr_registry_host(),
        image_uri    = image_uri         ,
        port         = EC2__SEND_PORT    ,
        access_token = access_token      )


# ─── Instance Management ────────────────────────────────────────────────────────

def find_instances(ec2=None, states=None):
    ec2 = ec2 or boto3.client('ec2')
    states = states or ['pending', 'running', 'stopping', 'stopped']
    result = ec2.describe_instances(Filters=[
        {'Name': f'tag:{TAG__SERVICE_KEY}', 'Values': [TAG__SERVICE_VALUE]},
        {'Name': 'instance-state-name',     'Values': states              }])
    instances = []
    for reservation in result['Reservations']:
        for instance in reservation['Instances']:
            instances.append(instance)
    return instances


def resolve_target(ec2, target: str = None):
    instances = find_instances(ec2)
    if not instances:
        typer.echo('No sg-send-ec2 instances found.')
        raise typer.Exit(1)
    if target is None:
        if len(instances) == 1:
            return instances[0]
        typer.echo(f'Multiple instances found ({len(instances)}). Specify a target name.')
        raise typer.Exit(1)
    for inst in instances:
        tags = {t['Key']: t['Value'] for t in inst.get('Tags', [])}
        if tags.get(TAG__DEPLOY_NAME_KEY) == target or inst['InstanceId'] == target:
            return inst
    typer.echo(f'Instance "{target}" not found.')
    raise typer.Exit(1)


def get_instance_tag(instance, key):
    for tag in instance.get('Tags', []):
        if tag['Key'] == key:
            return tag['Value']
    return ''


# ─── CLI Commands ───────────────────────────────────────────────────────────────

@app.command()
def create(name     : str = typer.Option(None, help='Deploy name (random if omitted)'),
           image    : str = typer.Option(None, help='ECR image URI (latest if omitted)'),
           token    : str = typer.Option(None, help='Access token (random if omitted)') ,
           creator  : str = typer.Option('claude-code', help='Creator tag value')       ):
    """Launch a new SGraph Send EC2 instance."""
    deploy_name  = name  or generate_deploy_name()
    image_uri    = image or default_image_uri()
    access_token = token or os.environ.get('SGRAPH_SEND__ACCESS_TOKEN') or generate_access_token()

    typer.echo(f'  Creating instance: {deploy_name}')
    typer.echo(f'  Image: {image_uri}')
    typer.echo(f'  Access token: {access_token}')

    ensure_instance_profile()
    sg_id = ensure_security_group()
    ami_id = latest_al2023_ami()

    user_data = render_user_data(image_uri=image_uri, access_token=access_token)

    ec2 = boto3.client('ec2')

    for attempt in range(5):
        try:
            response = ec2.run_instances(
                ImageId          = ami_id                                           ,
                InstanceType     = EC2__INSTANCE_TYPE                               ,
                MinCount         = 1                                                ,
                MaxCount         = 1                                                ,
                SecurityGroupIds = [sg_id]                                          ,
                IamInstanceProfile = {'Name': IAM__INSTANCE_PROFILE}                ,
                UserData         = user_data                                        ,
                TagSpecifications = [{'ResourceType': 'instance',
                                      'Tags': [{'Key': 'Name',              'Value': f'{TAG__SERVICE_VALUE}/{deploy_name}'},
                                               {'Key': TAG__SERVICE_KEY,    'Value': TAG__SERVICE_VALUE                   },
                                               {'Key': TAG__DEPLOY_NAME_KEY,'Value': deploy_name                          },
                                               {'Key': TAG__CREATOR_KEY,    'Value': creator                              },
                                               {'Key': TAG__ACCESS_TOKEN_KEY,'Value': access_token                        }]}])
            break
        except ec2.exceptions.ClientError as e:
            if 'Invalid IAM Instance Profile' in str(e) and attempt < 4:
                typer.echo(f'  IAM profile not ready, retrying ({attempt + 1}/5)...')
                time.sleep(5 * (attempt + 1))
            else:
                raise

    instance_id = response['Instances'][0]['InstanceId']
    typer.echo(f'  Instance ID: {instance_id}')
    typer.echo(f'  Waiting for instance to start...')
    ec2.get_waiter('instance_running').wait(InstanceIds=[instance_id])
    public_ip = ec2.describe_instances(InstanceIds=[instance_id])['Reservations'][0]['Instances'][0].get('PublicIpAddress', 'N/A')
    typer.echo(f'  Public IP: {public_ip}')
    typer.echo(f'  URL: http://{public_ip}:{EC2__SEND_PORT}/')
    typer.echo(f'  Health: http://{public_ip}:{EC2__SEND_PORT}/config/status')
    typer.echo(f'\n  Run: sg-send-ec2 wait {deploy_name}')


@app.command()
def list_instances():
    """List all sg-send-ec2 instances."""
    instances = find_instances()
    if not instances:
        typer.echo('No instances found.')
        return
    for inst in instances:
        tags        = {t['Key']: t['Value'] for t in inst.get('Tags', [])}
        deploy_name = tags.get(TAG__DEPLOY_NAME_KEY, '?')
        state       = inst['State']['Name']
        ip          = inst.get('PublicIpAddress', 'N/A')
        typer.echo(f'  {deploy_name:<20} {inst["InstanceId"]}  {state:<10}  {ip}')


@app.command()
def info(target: str = typer.Argument(None, help='Deploy name or instance ID')):
    """Show instance details including access token."""
    ec2 = boto3.client('ec2')
    instance = resolve_target(ec2, target)
    tags = {t['Key']: t['Value'] for t in instance.get('Tags', [])}
    ip = instance.get('PublicIpAddress', 'N/A')
    typer.echo(f'  Name:         {tags.get(TAG__DEPLOY_NAME_KEY, "?")}')
    typer.echo(f'  Instance ID:  {instance["InstanceId"]}')
    typer.echo(f'  State:        {instance["State"]["Name"]}')
    typer.echo(f'  IP:           {ip}')
    typer.echo(f'  Access Token: {tags.get(TAG__ACCESS_TOKEN_KEY, "?")}')
    typer.echo(f'  Creator:      {tags.get(TAG__CREATOR_KEY, "?")}')
    typer.echo(f'  URL:          http://{ip}:{EC2__SEND_PORT}/')


@app.command()
def wait(target  : str = typer.Argument(None, help='Deploy name or instance ID'),
         timeout : int = typer.Option(300, help='Timeout in seconds')           ):
    """Wait for the service to become healthy."""
    ec2 = boto3.client('ec2')
    instance = resolve_target(ec2, target)
    ip = instance.get('PublicIpAddress')
    if not ip:
        typer.echo('  Instance has no public IP.')
        raise typer.Exit(1)

    url = f'http://{ip}:{EC2__SEND_PORT}/config/status'
    typer.echo(f'  Waiting for {url} ...')
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=5)
            if r.status_code in (200, 401):
                typer.echo(f'  Service up (HTTP {r.status_code})')
                return
        except requests.ConnectionError:
            pass
        time.sleep(5)
    typer.echo('  Timeout waiting for service.')
    raise typer.Exit(1)


@app.command()
def health(target: str = typer.Argument(None, help='Deploy name or instance ID')):
    """Check service health."""
    ec2 = boto3.client('ec2')
    instance = resolve_target(ec2, target)
    ip = instance.get('PublicIpAddress')
    tags = {t['Key']: t['Value'] for t in instance.get('Tags', [])}
    token = tags.get(TAG__ACCESS_TOKEN_KEY, '')
    url = f'http://{ip}:{EC2__SEND_PORT}/config/status'
    headers = {'x-sgraph-access-token': token} if token else {}
    try:
        r = requests.get(url, headers=headers, timeout=10)
        typer.echo(f'  HTTP {r.status_code}: {r.text[:200]}')
    except Exception as e:
        typer.echo(f'  Error: {e}')
        raise typer.Exit(1)


@app.command()
def logs(target: str = typer.Argument(None, help='Deploy name or instance ID')):
    """Show setup logs via SSM."""
    ec2 = boto3.client('ec2')
    instance = resolve_target(ec2, target)
    instance_id = instance['InstanceId']
    ssm_run(instance_id, ['cat /var/log/sg-send-setup.log'])


@app.command()
def connect(target: str = typer.Argument(None, help='Deploy name or instance ID')):
    """Open an interactive SSM shell."""
    ec2 = boto3.client('ec2')
    instance = resolve_target(ec2, target)
    instance_id = instance['InstanceId']
    subprocess.run(['aws', 'ssm', 'start-session', '--target', instance_id,
                    '--region', aws_region()])


@app.command()
def forward(target    : str = typer.Argument(None, help='Deploy name or instance ID'),
            local_port: int = typer.Option(8080, help='Local port to forward to')    ):
    """Port-forward the service to localhost via SSM."""
    ec2 = boto3.client('ec2')
    instance = resolve_target(ec2, target)
    instance_id = instance['InstanceId']
    typer.echo(f'  Forwarding localhost:{local_port} -> {instance_id}:{EC2__SEND_PORT}')
    typer.echo(f'  Access at: http://localhost:{local_port}/')
    subprocess.run(['aws', 'ssm', 'start-session',
                    '--target', instance_id,
                    '--document-name', 'AWS-StartPortForwardingSession',
                    '--parameters', json.dumps({
                        'portNumber': [str(EC2__SEND_PORT)],
                        'localPortNumber': [str(local_port)]}),
                    '--region', aws_region()])


@app.command()
def delete(target: str = typer.Argument(None, help='Deploy name or instance ID'),
           force : bool = typer.Option(False, '--force', help='Skip confirmation') ):
    """Terminate an instance."""
    ec2 = boto3.client('ec2')
    instance = resolve_target(ec2, target)
    deploy_name = get_instance_tag(instance, TAG__DEPLOY_NAME_KEY)
    instance_id = instance['InstanceId']
    if not force:
        typer.confirm(f'Terminate {deploy_name} ({instance_id})?', abort=True)
    ec2.terminate_instances(InstanceIds=[instance_id])
    typer.echo(f'  Terminated: {instance_id}')


@app.command()
def exec_cmd(target: str = typer.Argument(None, help='Deploy name or instance ID'),
             cmd   : str = typer.Option('docker ps', help='Command to run')       ):
    """Run a command on the instance via SSM."""
    ec2 = boto3.client('ec2')
    instance = resolve_target(ec2, target)
    ssm_run(instance['InstanceId'], [cmd])


# ─── SSM Helper ─────────────────────────────────────────────────────────────────

def ssm_run(instance_id: str, commands: list, timeout: int = 60):
    ssm = boto3.client('ssm')
    response = ssm.send_command(
        InstanceIds  = [instance_id]           ,
        DocumentName = 'AWS-RunShellScript'    ,
        Parameters   = {'commands': commands}  ,
        TimeoutSeconds = timeout               )
    command_id = response['Command']['CommandId']

    time.sleep(2)
    for _ in range(timeout // 2):
        result = ssm.get_command_invocation(CommandId=command_id, InstanceId=instance_id)
        if result['Status'] in ('Success', 'Failed', 'TimedOut', 'Cancelled'):
            break
        time.sleep(2)

    stdout = result.get('StandardOutputContent', '')
    stderr = result.get('StandardErrorContent', '')
    if stdout:
        typer.echo(stdout)
    if stderr:
        typer.echo(stderr, err=True)
    if result['Status'] != 'Success':
        typer.echo(f'  Command status: {result["Status"]}')
        raise typer.Exit(1)


if __name__ == '__main__':
    app()
