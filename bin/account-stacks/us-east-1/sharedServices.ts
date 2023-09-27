import { Backup } from "@common/backup";
import { Config } from "@common/config";
import { IamRoles } from "@common/iamRoles";
import { Kms } from "@common/kms";
import { Vpc } from "@common/vpc";
import {
  accounts,
  awsConfigDetails,
  backupDetails,
  organizationDetails,
  organizationSecretNames,
  prefixLists,
  securityOrganizationViewOnlyRoleName,
  sharedServicesRoute53eventBusName,
  topLevelDomainName,
} from "@config/coreConfig";
import { ClientVpn } from "@environments/shared-services/clientVpn";
import { Route53 } from "@environments/shared-services/route53";
import { TransitGateway } from "@environments/shared-services/transitGateway";
import { VpcPrefixLists } from "@environments/shared-services/vpcPrefixLists";
import { getAccountFromShortName } from "@helpers/accounts";
import { Account, friendlySubnetType, protocol } from "@lib/types";
import { App, Environment } from "aws-cdk-lib";
import * as fs from "fs";
import * as path from "path";

export function sharedServicesStacks(app: App, env: Environment, accountDetails: Account) {
  new Config(app, "config", {
    env,
    stackName: "config",
    description: "AWS Config",
    s3Props: {
      bucketName: awsConfigDetails.configOrganizationBucketName,
      isExistingBucket: true,
    },
  });

  const kmsStack = new Kms(app, "kms", {
    env,
    stackName: "kms",
    description: "KMS Key Management",
    enableAwsBackupsKey: true,
    enableDefaultEbsEncryption: true,
    enableEbsKey: true,
    enableSecretsManagerKey: false,
    organizationSecretSharingKey: {
      organizationId: organizationDetails.organizationId,
    },
  });

  const transitGatewayStack = new TransitGateway(app, "transit-gateway", {
    env,
    stackName: "transit-gateway",
    description: "Transit Gateway shared via Resource Access Manager (RAM)",
    organizationAccountId: getAccountFromShortName("organization").id,
    organizationId: organizationDetails.organizationId,
    secretName: organizationSecretNames.transitGateway,
    kmsKey: kmsStack.organizationSecretSharing,
  });

  // Collect all of the domains from the accounts configuration,
  const authorizedSubDomains = accounts.map((account) => account.zoneName!).filter((zoneName) => zoneName);

  if (topLevelDomainName !== "UNUSED") {
    new Route53(app, "route53", {
      env,
      stackName: "route53",
      description: "Primary domain management and optional cross account event bus",
      authorizedSubDomains,
      busName: sharedServicesRoute53eventBusName,
      hostedZoneDomain: topLevelDomainName,
      organizationId: organizationDetails.organizationId,
    });
  }

  // Identify spoke CIDRs that will have potential comms via the TGW
  const spokeCidrs = [getAccountFromShortName("research").primaryVpcCidr!];
  const vpcStack = new Vpc(app, "vpc", {
    env,
    stackName: "shared-services-vpc",
    description: "Shared VPC for Transit Gateway deployment",
    name: "shared-services",
    vpcProps: {
      cidrBlock: accountDetails.primaryVpcCidr,
      natType: "gateway",
      maxAzs: 2,
      transitGatewayProps: {
        transitGatewayId: transitGatewayStack.id,
        routes: {
          public: spokeCidrs,
          private: spokeCidrs,
        },
      },
    },
  });
  spokeCidrs.forEach((cidr, idx) => {
    vpcStack.addNaclToSubnetType(friendlySubnetType.private, {
      action: "allow",
      cidr,
      protocol: protocol.all,
      ruleNumber: 200 + idx * 10,
    });
  });

  // Amazon provide DNS must be used to resolve internal ALBs, etc
  const vpnCidrBase = accountDetails.primaryVpcCidr!.split(".").slice(0, 3).join(".");
  const clientVpnMetadataFileBasePath = path.resolve(__dirname, "../../../config");
  const clientVpnMetadataFile = `${clientVpnMetadataFileBasePath}/identity-center-client-vpn-metadata.xml`;
  const clientVpnSelfServicePortalMetadataFile = `${clientVpnMetadataFileBasePath}/identity-center-client-vpn-self-service-metadata.xml`;

  // Conditionally create the ClientVPN if the respective metadata files exist
  if (fs.existsSync(clientVpnMetadataFile) && fs.existsSync(clientVpnSelfServicePortalMetadataFile)) {
    new ClientVpn(app, "client-vpn", {
      env,
      stackName: "client-vpn",
      description: "AWS Client VPN deployment with SSO Federated authentication",
      dnsServers: [`${vpnCidrBase}.2`, "8.8.8.8"],
      name: "vpn1",
      providerMetadataFilePath: clientVpnMetadataFile,
      providerSelfServiceMetadataFilePath: clientVpnSelfServicePortalMetadataFile,
      spokeVpcCidrs: [getAccountFromShortName("research").primaryVpcCidr!],
      vpc: vpcStack.vpc,
    });
  }

  new VpcPrefixLists(app, "shared-prefix-lists", {
    env,
    stackName: "shared-prefix-lists",
    description: "Prefix Lists shared across the AWS Organization",
    listDetails: prefixLists,
    organizationId: organizationDetails.organizationId,
  });

  new Backup(app, "backups", {
    env,
    stackName: "backups",
    description: "AWS Backup configurations",
    kmsKey: kmsStack.backup,
    services: {
      Aurora: true,
      S3: true,
    },
    dailyBackupOneMonthVaultName: backupDetails.dailyBackupOneMonthVaultName,
    dailyBackupOneWeekVaultName: backupDetails.dailyBackupOneWeekVaultName,
    roleName: backupDetails.roleName,
  });

  new IamRoles(app, "iam-roles", {
    env,
    stackName: "iam-roles",
    description: "IAM roles",
    securityOrganizationViewOnlyRoleName,
  });
}
