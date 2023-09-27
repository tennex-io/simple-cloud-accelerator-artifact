import { EC2Client, DescribeTransitGatewayAttachmentsCommand } from "@aws-sdk/client-ec2";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

export async function handler(event: CloudFormationCustomResourceEvent, context: Context) {
  console.log("event: ", event);

  try {
    const client = new EC2Client({});
    const command = new DescribeTransitGatewayAttachmentsCommand({
      Filters: [
        {
          Name: "resource-type",
          Values: ["vpn"],
        },
      ],
    });
    const response = await client.send(command);
    return {
      Data: {
        vpnAttachmentId: response.TransitGatewayAttachments![0].TransitGatewayAttachmentId,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
