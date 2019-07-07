import { config } from 'dotenv-safe';

const { parsed } = config();

export default parsed!;
