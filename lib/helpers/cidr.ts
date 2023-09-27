// Credit - aws-cdk https://github.com/aws/aws-cdk/blob/7abcbc6df6e4a37b3b1ef6c26328d4ecaff56fa6/packages/@aws-cdk/aws-ec2/lib/network-util.ts
// Dried out here to avoid deep imports from the CDK

/**
 * Validates an IPv4 string
 *
 * returns true of the string contains 4 numbers between 0-255 delimited by
 * a `.` character
 */
function validIp(ipAddress: string): boolean {
  const octets = ipAddress.split(".");
  if (octets.length !== 4) {
    return false;
  }
  const results = octets.map((octet: string) => parseInt(octet, 10));
  return results.filter((octet: number) => octet >= 0 && octet <= 255).length === 4;
}

/**
 * Converts a string IPv4 to a number
 *
 * takes an IP Address (e.g. 174.66.173.168) and converts to a number
 * (e.g 2923605416); currently only supports IPv4
 *
 * Uses the formula:
 * (first octet * 256³) + (second octet * 256²) + (third octet * 256) +
 * (fourth octet)
 *
 * @param  {string} the IP address (e.g. 174.66.173.168)
 * @returns {number} the integer value of the IP address (e.g 2923605416)
 */
export function ipToNum(ipAddress: string): number {
  if (!validIp(ipAddress)) {
    throw new Error(`${ipAddress} is not valid`);
  }

  return ipAddress.split(".").reduce((p: number, c: string, i: number) => p + parseInt(c, 10) * 256 ** (3 - i), 0);
}

/**
 * Takes number and converts it to IPv4 address string
 *
 * Takes a number (e.g 2923605416) and converts it to an IPv4 address string
 * currently only supports IPv4
 *
 * @param  {number} the integer value of the IP address (e.g 2923605416)
 * @returns {string} the IPv4 address (e.g. 174.66.173.168)
 */
export function numToIp(ipNum: number): string {
  // this all because bitwise math is signed
  let remaining = ipNum;
  const address: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (remaining !== 0) {
      address.push(Math.floor(remaining / 256 ** (3 - i)));
      remaining = remaining % 256 ** (3 - i);
    } else {
      address.push(0);
    }
  }
  const ipAddress: string = address.join(".");
  if (!validIp(ipAddress)) {
    throw new Error(`${ipAddress} is not a valid IP Address`);
  }
  return ipAddress;
}

/**
 * Get Tranist Gateway CIDRs from a VPC CIDR
 *
 * Uses the last /24 of a VPC CIDR to allocate 16 /28 CIDRs
 * for use with a Transit Gateway subnets
 *
 * @param vpcCidr - VPC CIDR - E.g. '10.0.0.0/16'
 * @returns - string list of CIDR ranges with a /28
 */
export function getTransitSubnetCidrsFromVpcCidr(vpcCidr: string): string[] {
  const networkAddress = ipToNum(vpcCidr);
  const vpcMask = parseInt(vpcCidr.split("/")[1]);
  const networkSize = 2 ** (32 - vpcMask);

  // Get the minimum CIDR address.  We'll use this to calculate the max CIDR address.
  // Example: 10.0.0.0
  const minAddress = networkAddress - (networkAddress % networkSize);

  // Get the last class C in the range.
  // Example 10.0.255.0
  const maxAddress = minAddress + networkSize - 256;

  // Tranist Gateways are recommended to be /28.  We're going /27 because
  // it's the minimum size for Client VPN subnet associations
  const transitNetworkSize = 2 ** (32 - 27);

  // There can only be 8 /27's in a /24
  const max27 = 8;

  // Max Availability Zones (AZ) is currently 6.  We'll return all 16 to
  // be mapped AZ to CIDR
  const transitRanges: string[] = [];
  for (let i = 0; i < max27; i++) {
    const rangeStart = numToIp(maxAddress + transitNetworkSize * i);
    transitRanges.push(`${rangeStart}/27`);
  }

  return transitRanges;
}

/**
 * Helper function to create unique CDK resource names
 *
 * @example '10.0.0.0/16' becomes '1000016'
 *
 * @param cidr - valid CIDR.
 * @returns CIDR without . or /
 */
export function stripCidr(cidr: string) {
  return cidr.replace(/(\.|\/)/g, "");
}

/**
 * Checks if a given string is a valid CIDR.
 * @param cidr The string to check.
 * @returns True if the given string is a valid CIDR.
 */
export function isValidCidr(cidr: string) {
  const regex = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/;
  return regex.test(cidr);
}
