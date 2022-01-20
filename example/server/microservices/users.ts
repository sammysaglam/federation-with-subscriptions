import fs from "fs";
import path from "path";

import { createMicroservice } from "../../../src";

const NAME = "Users";
const PORT = 4002;

const db = {
  users: [
    {
      userId: "1",
      someOtherId: "dude",
      name: "Johnny",
      moreData: { hello: "world" },
    },
  ],
};

export const usersMicroservice = () =>
  createMicroservice({
    label: NAME,
    port: PORT,
    typeDefs: fs.readFileSync(path.join(__dirname, "users.graphql"), "utf-8"),
    resolvers: {
      Query: {
        users: () => db.users,
      },
    },
  });
