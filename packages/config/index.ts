export const temporalConfig = {
  address: process.env.TEMPORAL_ADDRESS || "127.0.0.1:7233",
  namespace: process.env.TEMPORAL_NAMESPACE || "default",
  useTLS: process.env.TEMPORAL_USE_TLS === "true",
};
export const expressConfig = {
  port: process.env.PORT || 3000,
};
