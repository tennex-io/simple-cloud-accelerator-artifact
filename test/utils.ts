import { Template } from "aws-cdk-lib/assertions";

/**
 * Get the resource name of a particular resource.
 *
 * Useful when trying to match a proper !Ref between resources
 * @param template CDK template
 * @param resourceType CFN resource type.  E.g. 'AWS::S3::Bucket'
 * @param resourceProps CFN properties to search for.  Used by the template.findResources() method
 * @returns name of the resource if found, otherwise undefined
 */
export function getResourceName(template: Template, resourceType: string, resourceProps?: any) {
  const resource = template.findResources(resourceType, resourceProps);
  return Object.keys(resource)[0] ?? undefined;
}

/**
 * Get the resource name of a role associated with a specific Lambda function.
 * @param resource CFN resource
 * @returns string name of the role resource
 */
export function getLambdaFunctionRoleResourceId(resource: Record<string, Record<string, any>>) {
  const properties = Object.values(resource)[0].Properties;
  return properties.Role["Fn::GetAtt"][0];
}
