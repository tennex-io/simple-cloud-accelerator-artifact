import { accounts } from "@config/coreConfig";
import { ssoDetails } from "@config/ssoConfig";
import { getAccountFromShortName } from "@helpers/accounts";
import { shortAccountName } from "@lib/types";
import { aws_sso as sso, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface SsoProps extends StackProps {
  instanceArn: typeof ssoDetails.instanceArn;
  groupIds: typeof ssoDetails.groupIds;
}

export class Sso extends Stack {
  private instanceArn: typeof ssoDetails.instanceArn;

  constructor(scope: Construct, id: string, props: SsoProps) {
    super(scope, id, props);

    this.instanceArn = props.instanceArn;
    const { groupIds } = props;

    const administratorAccess = new sso.CfnPermissionSet(this, "administratorAccess", {
      instanceArn: props.instanceArn,
      name: "AWSAdministratorAccess",
      description: "Provides full access to AWS services and resources.",
      managedPolicies: ["arn:aws:iam::aws:policy/AdministratorAccess"],
    });

    this.associateGroupPermissionSetToAccount(groupIds["admin-all-accounts"], administratorAccess, "ALL_ACCOUNTS");

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const powerUserAccess = new sso.CfnPermissionSet(this, "powerUserAccess", {
      instanceArn: props.instanceArn,
      name: "AWSPowerUserAccess",
      description:
        "Provides full access to AWS services and resources, but does not allow management of Users and groups.",
      managedPolicies: ["arn:aws:iam::aws:policy/PowerUserAccess"],
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const readOnlyAccess = new sso.CfnPermissionSet(this, "readOnlyAccess", {
      instanceArn: props.instanceArn,
      name: "AWSReadOnlyAccess",
      description: "This policy grants permissions to view resources and basic metadata across all AWS services.",
      managedPolicies: ["arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"],
    });
  }

  /**
   * Manage permission set to account to group mapping.
   *
   * @param groupId Group Name that will be assigned the permission set
   * @param permissionSet Permission set ARN
   * @param accountShortNames Short name of the target account for assignment, or 'ALL_ACCOUNTS'
   */
  associateGroupPermissionSetToAccount(
    groupId: string,
    permissionSet: sso.CfnPermissionSet,
    accountShortNames: shortAccountName[] | "ALL_ACCOUNTS"
  ) {
    const acc = accountShortNames === "ALL_ACCOUNTS" ? accounts.map((account) => account.name) : accountShortNames;
    acc.forEach((account) => {
      new sso.CfnAssignment(this, `${account}${groupId}`, {
        instanceArn: this.instanceArn,
        permissionSetArn: permissionSet.attrPermissionSetArn,
        principalId: groupId,
        principalType: "GROUP",
        targetId: getAccountFromShortName(account).id,
        targetType: "AWS_ACCOUNT",
      });
    });
  }
}
