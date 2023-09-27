export function preventS3Removals(bucketDetails: Record<string, string[]>) {
  const bucketArns: string[] = [];
  const bucketsWithPath: string[] = [];

  Object.entries(bucketDetails).forEach(([bucketName, paths]) => {
    const bucketArn = `arn:aws:s3:::${bucketName}`;
    bucketArns.push(bucketArn);
    paths.forEach((path) => bucketsWithPath.push(`${bucketArn}${path}`));
  });

  const body = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "preventBucketObjectRemoval",
        Action: ["s3:DeleteObject", "s3:DeleteObjectVersion"],
        Resource: bucketsWithPath,
        Effect: "Deny",
      },
      {
        Sid: "preventBucketRemoval",
        Action: ["s3:DeleteBucket"],
        Resource: bucketArns,
        Effect: "Deny",
      },
    ],
  };
  return body;
}
