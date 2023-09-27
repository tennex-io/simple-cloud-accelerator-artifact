import { aws_organizations as organizations, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { organizationDetails } from "@config/coreConfig";
import { Account } from "@lib/types";

interface OrganizationCoreProps extends StackProps {
  organizationalUnits: typeof organizationDetails.organizationalUnits;
  organizationRootId: string;
  accountSsoNamePrefix?: string;
  accounts: Account[];
}
type OrganizationalUnitName = (typeof organizationDetails.organizationalUnits)[number];

function initalizeOus() {
  const entry: Record<string, string> = {};
  typeof organizationDetails.organizationalUnits.forEach((ou) => (entry[ou] = ""));
  return entry;
}

export class OrganizationCore extends Stack {
  public readonly ous: Record<OrganizationalUnitName, string> = initalizeOus();
  public readonly accounts: Record<string, string> = {};

  constructor(scope: Construct, id: string, props: OrganizationCoreProps) {
    super(scope, id, props);

    props.organizationalUnits.forEach((ou) => {
      const unit = new organizations.CfnOrganizationalUnit(this, ou, {
        name: ou,
        parentId: props.organizationRootId,
      });

      // Store a name:id relationship for easy referencing
      this.ous[ou] = unit.attrId;
    });

    props.accounts.forEach((account) => {
      let parentOu;

      // If an explicit name is set, use that.  Otherwise, fall back to the name property
      // Explicit names may be set for imported accounts
      let accountName = account.ssoAccountName ? account.ssoAccountName : account.name;

      // If a parent OU is defined, do a lookup to collect the OU ID
      if (account.parentOrganizationalUnit) {
        parentOu = [this.ous[account.parentOrganizationalUnit]];
      }

      // If a account name prefix is defined, prepend it to the account name
      if (props.accountSsoNamePrefix) {
        accountName = props.accountSsoNamePrefix;
      } else {
        accountName = this.normalizeAccountName(accountName);
      }

      const acct = new organizations.CfnAccount(this, `account${account.name}`, {
        accountName,
        email: account.email,
        parentIds: parentOu,
      });
      this.accounts[account.name] = acct.attrAccountId;
      acct.applyRemovalPolicy(RemovalPolicy.RETAIN);
    });
  }

  /**
   * Remove - and _ from the account name and convert each word to proper case
   * This name will be part of what's represended in the AWS SSO login page.
   *
   * @param name account name
   * @returns account name with each word in proper case
   */
  private normalizeAccountName(name: string) {
    const dashScrub = name.replace(/-|_/g, " ");
    const wordsToProperCase = dashScrub
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return wordsToProperCase;
  }
}
