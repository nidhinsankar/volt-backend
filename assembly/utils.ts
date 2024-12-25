export function bytesToUUID(bytes: string): string {
  const byteArray = bytes
    .split(",")
    .map<u8>((num: string) => u8(parseInt(num, 10)));
  const hexArray = byteArray.map<string>((byte) =>
    byte.toString(16).padStart(2, "0"),
  );

  return (
    hexArray.slice(0, 4).join("") +
    "-" +
    hexArray.slice(4, 6).join("") +
    "-" +
    hexArray.slice(6, 8).join("") +
    "-" +
    hexArray.slice(8, 10).join("") +
    "-" +
    hexArray.slice(10).join("")
  );
}
