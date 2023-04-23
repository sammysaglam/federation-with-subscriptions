import {
  ApolloServer,
  ApolloServerOptionsWithStaticSchema,
  BaseContext,
  ContextThunk,
  HTTPGraphQLRequest,
  HTTPGraphQLResponse,
} from "@apollo/server";
import { SchemaManager } from "@apollo/server/dist/esm/utils/schemaManager";
import { makeExecutableSchema } from "@graphql-tools/schema";

export type ExecuteHTTPGraphQLRequestParams<TContext extends BaseContext> = {
  readonly httpGraphQLRequest: HTTPGraphQLRequest | undefined;
  readonly context: TContext | undefined;
};

export type ExtendedApolloServerOptionsSchema<TContext extends BaseContext> =
  Omit<
    ApolloServerOptionsWithStaticSchema<TContext>,
    "resolvers" | "schema" | "typeDefs"
  > & {
    readonly schema:
      | ApolloServerOptionsWithStaticSchema<TContext>["schema"]
      | ((
          params: ExecuteHTTPGraphQLRequestParams<TContext>,
        ) =>
          | NonNullable<ApolloServerOptionsWithStaticSchema<TContext>["schema"]>
          | Promise<
              NonNullable<
                ApolloServerOptionsWithStaticSchema<TContext>["schema"]
              >
            >);

    readonly typeDefs?: undefined;

    readonly resolvers?: undefined;
  };

export type ExtendedApolloServerOptionsTypeDefs<TContext extends BaseContext> =
  Omit<
    ApolloServerOptionsWithStaticSchema<TContext>,
    "resolvers" | "schema" | "typeDefs"
  > & {
    readonly schema?: undefined;

    readonly typeDefs:
      | string
      | ((
          params: ExecuteHTTPGraphQLRequestParams<TContext>,
        ) => string | Promise<string>);

    readonly resolvers?:
      | NonNullable<ApolloServerOptionsWithStaticSchema<TContext>["resolvers"]>
      | ((
          params: ExecuteHTTPGraphQLRequestParams<TContext>,
        ) =>
          | NonNullable<
              ApolloServerOptionsWithStaticSchema<TContext>["resolvers"]
            >
          | Promise<
              NonNullable<
                ApolloServerOptionsWithStaticSchema<TContext>["resolvers"]
              >
            >);
  };

export type ExtendedApolloServerOptions<TContext extends BaseContext> =
  | ExtendedApolloServerOptionsSchema<TContext>
  | ExtendedApolloServerOptionsTypeDefs<TContext>;

// eslint-disable-next-line functional/no-classes
export class ExtendedApolloServer<
  TContext extends BaseContext,
> extends ApolloServer<TContext> {
  private readonly createTypeDefs: ExtendedApolloServerOptions<TContext>["typeDefs"];
  private readonly createSchema: ExtendedApolloServerOptions<TContext>["schema"];
  private readonly createResolvers: ExtendedApolloServerOptions<TContext>["resolvers"];

  constructor(config: ExtendedApolloServerOptions<TContext>) {
    super({
      ...config,
      schema: undefined,
      typeDefs: `type Query { initialized: Boolean }`,
      resolvers: { Query: { initialized: () => false } },
    });

    this.createTypeDefs = config.typeDefs;
    this.createSchema = config.schema;
    this.createResolvers = config.resolvers;
  }

  public async executeHTTPGraphQLRequest(params: {
    readonly httpGraphQLRequest: HTTPGraphQLRequest;
    readonly context: ContextThunk<TContext>;
  }): Promise<HTTPGraphQLResponse> {
    try {
      if (
        typeof this.createTypeDefs === "function" ||
        typeof this.createSchema === "function"
      ) {
        const builtParams: ExecuteHTTPGraphQLRequestParams<TContext> = {
          httpGraphQLRequest: params.httpGraphQLRequest,
          context: await params.context(),
        };

        const runningServerState =
          await this.constructor.prototype._ensureStarted.apply(this);

        const schemaManager: SchemaManager = runningServerState.schemaManager;

        const schema =
          typeof this.createTypeDefs === "function"
            ? makeExecutableSchema({
                typeDefs: await this.createTypeDefs(builtParams),
                resolvers:
                  typeof this.createResolvers === "function"
                    ? await this.createResolvers(builtParams)
                    : this.createResolvers,
              })
            : typeof this.createSchema === "function"
            ? await this.createSchema(builtParams)
            : undefined;

        if (!schema) {
          throw new Error("No schema!");
        }

        schemaManager.constructor.prototype.processSchemaLoadOrUpdateEvent.apply(
          schemaManager,
          [{ apiSchema: schema }],
        );

        return super.executeHTTPGraphQLRequest(params);
      }
    } catch (error) {
      console.error(error);
    }

    return super.executeHTTPGraphQLRequest(params);
  }
}
