import { DelegateOrganizationAdministrator } from "@customResources/organizationDelegateAdministrator";
import { EnableAwsServiceAccess } from "@customResources/organizationEnableAwsServiceAccess";
import { EnablePolicies } from "@customResources/organizationEnablePolicies";
import { EnableSharing } from "@customResources/ramEnableOrganizationSharing";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DelegatedAdministratorAccountIds } from "@lib/types";

export interface OrganizationServiceProps extends StackProps {
  /**
   * List of Organization services.
   * Details:
   *  - https://docs.aws.amazon.com/organizations/latest/userguide/orgs_integrate_services_list.html
   *
   * Unofficial list of Service Principals:
   *  - https://gist.github.com/shortjared/4c1e3fe52bdfa47522cfe5b41e5d6f22
   */
  enabledOrganizationServices: string[];
  /**
   * Organization Enabled Policies.  Allowed values:
   * - AISERVICES_OPT_OUT_POLICY
   * - BACKUP_POLICY
   * - SERVICE_CONTROL_POLICY
   * - TAG_POLICY
   */
  enabledPolicyTypes: Array<"AISERVICES_OPT_OUT_POLICY" | "BACKUP_POLICY" | "SERVICE_CONTROL_POLICY" | "TAG_POLICY">;
  /**
   * Root ID - E.g. 'r-04f5'
   */
  organizationRootId: string;
  /**
   * Delegated Administrator Target Accounts
   */
  delegatedAdministratorAccountIds: DelegatedAdministratorAccountIds;
}

export class OrganizationServices extends Stack {
  constructor(scope: Construct, id: string, props: OrganizationServiceProps) {
    super(scope, id, props);

    // Custom resources
    const awsServiceAccess = new EnableAwsServiceAccess(this, "organizationServices", {
      servicePrincipals: props.enabledOrganizationServices,
    });

    new EnablePolicies(this, "organizationEnablePolicies", {
      policyTypes: props.enabledPolicyTypes,
      organizationRootId: props.organizationRootId,
    });

    new EnableSharing(this, "ramSharing");

    const delegatedAdministrators = new DelegateOrganizationAdministrator(this, "organizationDelegatedAdministrators", {
      currentAccountid: this.account,
      ...props.delegatedAdministratorAccountIds,
    });

    // Service access must be enabled before we can delegate administrators
    delegatedAdministrators.node.addDependency(awsServiceAccess);
  }
}
