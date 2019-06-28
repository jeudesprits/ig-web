import cron from 'node-cron';
import { lakrimocaUnfollow } from './tasks';

const timezone = 'Etc/UTC';

cron.schedule(
  '0 6,7,9,10,11,16,20,21,22,23 * * MON-FRI',
  () => {
    // tslint:disable-next-line: no-floating-promises
    lakrimocaUnfollow();
  },
  { timezone }
);