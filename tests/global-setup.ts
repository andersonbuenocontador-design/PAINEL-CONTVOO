import { migrate } from '../scripts/migrate';
export default async function () {
  await migrate('postgres://painel:painel_dev@localhost:5432/painel_test');
}
