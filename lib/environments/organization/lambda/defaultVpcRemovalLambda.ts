import {
  DeleteInternetGatewayCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  DescribeInternetGatewaysCommand,
  DescribeNetworkInterfacesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  DetachInternetGatewayCommand,
  EC2Client,
  NetworkInterface,
  SecurityGroup,
  Subnet,
} from "@aws-sdk/client-ec2";
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { validRegion } from "@lib/types";
import { Context } from "aws-lambda";

async function getDefaultVpc(client: EC2Client): Promise<string | undefined> {
  const command = new DescribeVpcsCommand({
    Filters: [
      {
        Name: "isDefault",
        Values: ["true"],
      },
    ],
  });
  const { Vpcs } = await client.send(command);

  if (Vpcs!.length > 0) return Vpcs![0].VpcId;

  return undefined;
}

async function getSubnets(client: EC2Client, vpcId: string): Promise<Subnet[] | undefined> {
  const describeCommand = new DescribeSubnetsCommand({
    Filters: [
      {
        Name: "vpc-id",
        Values: [vpcId],
      },
    ],
  });
  const { Subnets } = await client.send(describeCommand);
  return Subnets!;
}

async function deleteSubnets(client: EC2Client, vpcId: string): Promise<void> {
  const subnets = await getSubnets(client, vpcId);
  await Promise.all(
    subnets!.map((subnet) => {
      const deleteCommand = new DeleteSubnetCommand({
        SubnetId: subnet.SubnetId,
      });
      return client.send(deleteCommand);
    })
  );
}

async function deleteVpc(client: EC2Client, vpcId: string): Promise<void> {
  const command = new DeleteVpcCommand({
    VpcId: vpcId,
  });
  await client.send(command);
}

async function deleteIgw(client: EC2Client, vpcId: string): Promise<void> {
  const describeCommand = new DescribeInternetGatewaysCommand({
    Filters: [
      {
        Name: "attachment.vpc-id",
        Values: [vpcId],
      },
    ],
  });
  const response = await client.send(describeCommand);

  if (response.InternetGateways!.length === 1) {
    const igwId = response.InternetGateways![0].InternetGatewayId;
    console.info(`Detaching and deleting ${igwId} from ${vpcId}`);

    const detachCommand = new DetachInternetGatewayCommand({
      InternetGatewayId: igwId,
      VpcId: vpcId,
    });

    await client.send(detachCommand);

    const deleteCommand = new DeleteInternetGatewayCommand({
      InternetGatewayId: igwId,
    });

    await client.send(deleteCommand);
  }
}

async function getSecurityGroups(client: EC2Client, vpcId?: string): Promise<SecurityGroup[] | undefined> {
  let params = {};
  if (vpcId) {
    params = {
      Filters: [
        {
          Name: "vpc-id",
          Values: [vpcId],
        },
      ],
    };
  }
  const command = new DescribeSecurityGroupsCommand(params);
  const { SecurityGroups } = await client.send(command);
  return SecurityGroups!;
}

async function getEnis(client: EC2Client, vpcId?: string): Promise<NetworkInterface[] | undefined> {
  let params = {};
  if (vpcId) {
    params = {
      Filters: [
        {
          Name: "vpc-id",
          Values: [vpcId],
        },
      ],
    };
  }
  const command = new DescribeNetworkInterfacesCommand(params);
  const { NetworkInterfaces } = await client.send(command);
  return NetworkInterfaces!;
}

interface ClientCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

async function getLocalAccountId() {
  const client = new STSClient({});
  const command = new GetCallerIdentityCommand({});
  const response = await client.send(command);
  return response.Account!;
}

async function assumeRole(accountId: string, roleName: string, credentials?: ClientCredentials) {
  const client = new STSClient({
    credentials,
  });
  const command = new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${accountId}:role/${roleName}`,
    RoleSessionName: "lambdaDefaultVpcRemoval",
  });
  const response = await client.send(command);
  return {
    accessKeyId: response.Credentials!.AccessKeyId!,
    secretAccessKey: response.Credentials!.SecretAccessKey!,
    sessionToken: response.Credentials!.SessionToken!,
  };
}

interface Event {
  targetAccountId: string;
  targetRegions: validRegion[];
}

export async function handler(event: Event, context: Context): Promise<string> {
  console.log("event: ", event);
  const { targetAccountId, targetRegions } = event;

  try {
    const localAccountId = await getLocalAccountId();

    let spokeAccountOrgAccessCreds;
    if (targetAccountId !== localAccountId) {
      // Assume the OrganizationAccountAccessRole in the target account.
      spokeAccountOrgAccessCreds = await assumeRole(targetAccountId, "OrganizationAccountAccessRole");
    }

    for (const region of targetRegions) {
      console.log(`Working in ${region}`);

      // when spokeAccountOrgAccessCreds is undefined, the client will use the default credentials, which target the local account.
      const client = new EC2Client({
        credentials: spokeAccountOrgAccessCreds,
        region,
      });
      const vpcId = await getDefaultVpc(client);

      if (!vpcId) {
        console.log(`No default VPC found in ${region}.  Skipping.`);
      } else {
        // Sanity check 1, don't operate on anything with an allocated ENI (covers for Lambda, etc)
        const enis = await getEnis(client, vpcId);
        // Sanity Check 2, only the default security group should exist
        const securityGroups = await getSecurityGroups(client, vpcId);
        if (enis!.length === 0 && securityGroups!.length === 1) {
          await deleteIgw(client, vpcId);
          await deleteSubnets(client, vpcId);
          console.log(`Removing default vpc: ${vpcId} from ${region}`);
          await deleteVpc(client, vpcId);
        } else {
          if (enis!.length > 0)
            console.warn(`${vpcId} has ENIs.  Please remove all network interfaces and re-execute.`);
          if (securityGroups!.length > 1) {
            console.warn(
              "Multiple security groups exist.  Please remove all security groups but the default and re-execute."
            );
          }
        }
      }
    }
    return "success";
  } catch (error) {
    if (error instanceof Error) {
      // In the case that the account isn't ready for EC2 operations,
      // throw an explicit error so the state machine can retry after backoff
      if (error.message.includes("not subscribed to this service")) {
        throw new Error("ACCOUNT_NOT_READY");
      }
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
