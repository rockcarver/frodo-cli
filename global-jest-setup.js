export default async () => {
  process.env.TZ = 'UTC';
  process.env.FRODO_NO_CACHE = 'true';
};
