import { OrganizationServiceProps, OrganizationServices } from "@environments/organization/organization";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { lambdaCustomResourceFunctionPrefix, nodeVersion } from "@test/test-config";

const app = new App();
const organizationServicesProps = {
  enabledOrganizationServices: [
    "account.amazonaws.com",
    "backup.amazonaws.com",
    "cloudtrail.amazonaws.com",
    "config.amazonaws.com",
    "config-multiaccountsetup.amazonaws.com",
    "guardduty.amazonaws.com",
    "malware-protection.guardduty.amazonaws.com",
    "ram.amazonaws.com",
    "storage-lens.s3.amazonaws.com",
    "sso.amazonaws.com",
    "tagpolicies.tag.amazonaws.com",
  ],
  enabledPolicyTypes: ["BACKUP_POLICY", "SERVICE_CONTROL_POLICY", "TAG_POLICY"],
  organizationRootId: "r-9999",
  delegatedAdministratorAccountIds: {
    guardDutyAdminAccountId: "111111111111",
    configAdminAccountId: "111111111111",
    cloudTrailAdminAccountId: "111111111111",
  },
} as OrganizationServiceProps;

const organizationServicesStack = new OrganizationServices(app, "organization-services", organizationServicesProps);
const template = Template.fromStack(organizationServicesStack);

describe("Organization Services Stack", () => {
  const lambdaFunctions = template.findResources("AWS::Lambda::Function", {
    Properties: {
      FunctionName: Match.stringLikeRegexp(`^${lambdaCustomResourceFunctionPrefix}.*`),
    },
  });

  test(`All functions begining with ${lambdaCustomResourceFunctionPrefix}* use the ${nodeVersion} runtime`, () => {
    Object.values(lambdaFunctions).forEach((v) => {
      expect(v.Properties.Runtime).toBe(nodeVersion);
    });
  });

  test("The enable services custom resource passes the expected properties", () => {
    template.hasResourceProperties(
      "AWS::CloudFormation::CustomResource",
      Match.objectLike({
        servicePrincipals: organizationServicesProps.enabledOrganizationServices,
      })
    );
  });

  test("The enable polices custom resource passes the expected properties", () => {
    template.hasResourceProperties(
      "AWS::CloudFormation::CustomResource",
      Match.objectLike({
        policyTypes: organizationServicesProps.enabledPolicyTypes,
        organizationRootId: organizationServicesProps.organizationRootId,
      })
    );
  });

  test("The delegated administrator custom resource passes the expected account IDs", () => {
    const { delegatedAdministratorAccountIds } = organizationServicesProps;
    template.hasResourceProperties(
      "AWS::CloudFormation::CustomResource",
      Match.objectLike({
        configAdminAccountId: delegatedAdministratorAccountIds.cloudTrailAdminAccountId,
        guardDutyAdminAccountId: delegatedAdministratorAccountIds.guardDutyAdminAccountId,
        cloudTrailAdminAccountId: delegatedAdministratorAccountIds.cloudTrailAdminAccountId,
      })
    );
  });
});
