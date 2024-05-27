import * as dotenv from "dotenv";

const env = dotenv.config().parsed;

export const getEnv = () => {
    if (!env) {
        throw new Error("No .env file found");
    }
    return env;
};
