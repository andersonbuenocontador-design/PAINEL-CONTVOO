export const chaveNormalizada = (d: string) =>
  d.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length > 1).join(' ');
