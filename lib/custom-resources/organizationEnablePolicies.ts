import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

export interface EnablePoliciesProps {
  /**
   * Organization Policy Types that can be Enabled/Disabled
   */
  policyTypes: Array<"AISERVICES_OPT_OUT_POLICY" | "BACKUP_POLICY" | "SERVICE_CONTROL_POLICY" | "TAG_POLICY">;
  /**
   * Organization Root Id
   *
   * @example r-0001
   */
  organizationRootId: string;
}

export class EnablePolicies extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: EnablePoliciesProps) {
    super(scope, id, {
      functionName: "cdk-custom-resource-organization-enable-policies",
      functionDescription: "CDK/CFN Custom Resource for Organization policies",
      functionFilePath: path.join(__dirname, "functionCode", "organizationEnablePoliciesLambda.ts"),
      iamAllowActions: ["organizations:ListRoots", "organizations:EnablePolicyType", "organizations:DisablePolicyType"],
      resourceProperties: {
        policyTypes: props.policyTypes,
        organizationRootId: props.organizationRootId,
      },
    });
  }
}
