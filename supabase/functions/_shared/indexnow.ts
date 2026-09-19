export function validateIndexNowUrls(
  values: unknown[],
  origin: string,
): string[] {
  if (values.length > 10000)
    throw new Error("Submit at most 10,000 URLs at a time.");
  return [
    ...new Set(
      values.map((value) => {
        if (typeof value !== "string")
          throw new Error("Every URL must be a string.");
        const url = new URL(value, origin);
        if (
          url.origin !== origin ||
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error("Only URLs on this site's origin can be submitted.");
        url.hash = "";
        return url.href;
      }),
    ),
  ];
}
export function indexNowReceipt(status: number) {
  return status === 200
    ? "indexnow_submitted"
    : status === 202
      ? "indexnow_pending"
      : "error";
}
