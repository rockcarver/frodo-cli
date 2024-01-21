export default async () => {
  process.env.TZ = 'UTC';
  process.env.LANG = 'en-US';
  process.env.FRODO_NO_CACHE = 'true';
};
