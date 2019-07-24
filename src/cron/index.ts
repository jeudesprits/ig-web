import cron from 'node-cron';

const timezone = 'Etc/UTC';

cron.schedule(
    '0 6,7,9,10,11,16,20,21,22,23 * * MON-FRI',
    () => {
        // ...
    },
    { timezone },
);
