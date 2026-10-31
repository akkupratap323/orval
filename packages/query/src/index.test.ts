import type { GeneratorVerbOptions, ResReqTypesValue } from '@orval/core';
import { jsDoc, OutputClient, OutputHttpClient } from '@orval/core';
import { describe, expect, it } from 'vite-plus/test';

import {
  createTestGeneratorOptions,
  createTestGeneratorVerbOptions,
} from '../../core/src/test-utils';
import { builder, generateQuery, generateQueryHeader } from './index';
import { addRouteToDoc } from './query-generator';

const successType = (
  overrides: Partial<ResReqTypesValue> & Pick<ResReqTypesValue, 'value'>,
): ResReqTypesValue => ({
  key: '200',
  contentType: 'application/json',
  hasReadonlyProps: false,
  imports: [],
  isEnum: false,
  isRef: true,
  schemas: [],
  type: 'object',
  dependencies: [],
  ...overrides,
});

describe('throws when trying to use named parameters with vue-query client', () => {
  it('vue-query builder type', () => {
    expect(() =>
      builder({ type: 'vue-query' })().client(
        createTestGeneratorVerbOptions(),
        createTestGeneratorOptions({
          override: { useNamedParameters: true },
        }),
        'axios',
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: vue-query client does not support named parameters, and had broken reactivity previously, please set useNamedParameters to false; See for context: https://github.com/orval-labs/orval/pull/931#issuecomment-1752355686]',
    );
  });
  it('vue-query output client', () => {
    expect(() =>
      builder()().client(
        createTestGeneratorVerbOptions(),
        createTestGeneratorOptions({
          override: { useNamedParameters: true },
        }),
        'vue-query',
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: vue-query client does not support named parameters, and had broken reactivity previously, please set useNamedParameters to false; See for context: https://github.com/orval-labs/orval/pull/931#issuecomment-1752355686]',
    );
  });
});

describe('generateQuery — includeZodSchemaInArguments with a custom mutator', () => {
  const makeVerbOptions = (
    overrides: Parameters<typeof createTestGeneratorVerbOptions>[0] = {},
  ): GeneratorVerbOptions =>
    createTestGeneratorVerbOptions({
      verb: 'get',
      route: '/pets',
      pathRoute: '/pets',
      operationId: 'listPets',
      operationName: 'listPets',
      typeName: 'listPets',
      response: {
        definition: { success: 'Pets', errors: 'Error' },
        imports: [{ name: 'Pets' }, { name: 'Error' }],
        types: {
          success: [
            successType({
              value: 'Pets',
              imports: [{ name: 'Pets' }],
            }),
          ],
          errors: [],
        },
        contentTypes: ['application/json'],
      },
      mutator: {
        name: 'customFetch',
        path: './mutator.ts',
        default: false,
        hasErrorType: false,
        errorTypeName: '',
        hasSecondArg: false,
        hasThirdArg: false,
        isHook: false,
      },
      override: {
        requestOptions: true,
        fetch: {
          includeHttpResponseReturnType: false,
          forceSuccessResponse: false,
          runtimeValidation: { enabled: true, strategy: 'throw' },
        },
        query: {
          useQuery: true,
          shouldExportKeys: true,
          shouldExportHttpClient: true,
          shouldExportMutatorHooks: true,
        },
      },
      ...overrides,
    });

  const makeOptions = (includeZodSchemaInArguments: boolean) =>
    createTestGeneratorOptions({
      route: '/pets',
      pathRoute: '/pets',
      override: { includeZodSchemaInArguments },
      context: {
        output: {
          client: OutputClient.REACT_QUERY,
          httpClient: OutputHttpClient.FETCH,
          schemas: { path: './model', type: 'zod', splitByTags: false },
        },
      },
    });

  it('imports the response schema as a value when it is passed to the mutator', async () => {
    const { implementation, imports } = await generateQuery(
      makeVerbOptions(),
      makeOptions(true),
      'react-query',
    );

    expect(implementation).toContain('schema: Pets');
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'Pets', values: true }),
    );
  });

  it('imports the element schema and zod for an inline array response', async () => {
    const response = makeVerbOptions().response;
    const { implementation, imports } = await generateQuery(
      makeVerbOptions({
        response: {
          ...response,
          definition: { success: 'Pet[]', errors: 'Error' },
          imports: [{ name: 'Pet' }, { name: 'Error' }],
          types: {
            ...response.types,
            success: [
              {
                ...response.types.success[0],
                value: 'Pet[]',
                imports: [{ name: 'Pet' }],
                isRef: false,
                type: 'array',
              },
            ],
          },
        },
      }),
      makeOptions(true),
      'react-query',
    );

    expect(implementation).toContain('schema: zod.array(Pet)');
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'Pet', values: true }),
    );
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'zod', namespaceImport: true }),
    );
    expect(imports).not.toContainEqual(
      expect.objectContaining({ name: 'PetOutput' }),
    );
  });

  it('keeps the schema import type-only when the option is off', async () => {
    const { implementation, imports } = await generateQuery(
      makeVerbOptions(),
      makeOptions(false),
      'react-query',
    );

    expect(implementation).not.toContain('schema: Pets');
    expect(imports).toContainEqual({ name: 'Pets' });
    expect(imports).not.toContainEqual(
      expect.objectContaining({ name: 'Pets', values: true }),
    );
  });
});

describe('generateQuery — angular-query runtimeValidation of an inline array response', () => {
  const makeVerbOptions = (runtimeValidation: boolean): GeneratorVerbOptions =>
    createTestGeneratorVerbOptions({
      verb: 'get',
      route: '/items',
      pathRoute: '/items',
      operationId: 'listItems',
      operationName: 'listItems',
      typeName: 'listItems',
      response: {
        definition: { success: 'Item[]', errors: '' },
        imports: [{ name: 'Item' }],
        types: {
          success: [
            successType({
              value: 'Item[]',
              imports: [{ name: 'Item' }],
              isRef: false,
              type: 'array',
            }),
          ],
          errors: [],
        },
        contentTypes: ['application/json'],
      },
      override: {
        requestOptions: true,
        query: {
          useQuery: true,
          shouldExportKeys: true,
          shouldExportHttpClient: true,
          shouldExportMutatorHooks: true,
          runtimeValidation: { enabled: runtimeValidation, strategy: 'throw' },
        },
      },
    });

  const options = createTestGeneratorOptions({
    route: '/items',
    pathRoute: '/items',
    context: {
      output: {
        client: OutputClient.ANGULAR_QUERY,
        httpClient: OutputHttpClient.ANGULAR,
        schemas: { path: './model', type: 'zod', splitByTags: false },
      },
    },
  });

  it('parses the response through zod.array and imports what that needs', async () => {
    const { implementation, imports } = await generateQuery(
      makeVerbOptions(true),
      options,
      'angular-query',
    );

    expect(implementation).toContain('zod.array(Item).parse(data)');
    expect(implementation).toContain('): Promise<ItemOutput[]> =>');
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'Item', values: true }),
    );
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'ItemOutput' }),
    );
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'zod', namespaceImport: true }),
    );
  });

  it('leaves the response unvalidated when runtimeValidation is off', async () => {
    const { implementation, imports } = await generateQuery(
      makeVerbOptions(false),
      options,
      'angular-query',
    );

    expect(implementation).not.toContain('zod.array(');
    expect(implementation).toContain('): Promise<Item[]> =>');
    expect(imports).not.toContainEqual(
      expect.objectContaining({ name: 'zod' }),
    );
  });
});

describe('generateQuery — fetch runtimeValidation outside Angular (#4136, #4137)', () => {
  const makeVerbOptions = ({
    definition,
    imports,
    type,
    runtimeValidation = true,
  }: {
    definition: string;
    imports: { name: string }[];
    type: ResReqTypesValue['type'];
    runtimeValidation?: boolean;
  }): GeneratorVerbOptions =>
    createTestGeneratorVerbOptions({
      verb: 'get',
      route: '/items',
      pathRoute: '/items',
      operationId: 'listItems',
      operationName: 'listItems',
      typeName: 'listItems',
      response: {
        definition: { success: definition, errors: '' },
        imports,
        types: {
          success: [
            successType({
              value: definition,
              imports,
              isRef: type !== 'array',
              type,
            }),
          ],
          errors: [],
        },
        contentTypes: ['application/json'],
      },
      override: {
        requestOptions: true,
        fetch: {
          includeHttpResponseReturnType: false,
          forceSuccessResponse: false,
          runtimeValidation: {
            enabled: runtimeValidation,
            strategy: 'throw',
          },
        },
        query: {
          useQuery: true,
          shouldExportKeys: true,
          shouldExportHttpClient: true,
          shouldExportMutatorHooks: true,
        },
      },
    });

  const options = createTestGeneratorOptions({
    route: '/items',
    pathRoute: '/items',
    context: {
      output: {
        client: OutputClient.REACT_QUERY,
        httpClient: OutputHttpClient.FETCH,
        schemas: { path: './model', type: 'zod', splitByTags: false },
      },
    },
  });

  it('imports the schema as a value and the Output alias it declares', async () => {
    const { implementation, imports } = await generateQuery(
      makeVerbOptions({
        definition: 'Item',
        imports: [{ name: 'Item' }],
        type: 'object',
      }),
      options,
      'react-query',
    );

    expect(implementation).toContain('Item.parse(parsedBody)');
    expect(implementation).toContain('): Promise<ItemOutput> =>');
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'Item', values: true }),
    );
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'ItemOutput' }),
    );
  });

  it('imports the element schema and zod for an inline array response', async () => {
    const { implementation, imports } = await generateQuery(
      makeVerbOptions({
        definition: 'Item[]',
        imports: [{ name: 'Item' }],
        type: 'array',
      }),
      options,
      'react-query',
    );

    expect(implementation).toContain('zod.array(Item).parse(parsedBody)');
    expect(implementation).toContain('): Promise<ItemOutput[]> =>');
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'Item', values: true }),
    );
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'ItemOutput' }),
    );
    expect(imports).toContainEqual(
      expect.objectContaining({ name: 'zod', namespaceImport: true }),
    );
  });

  it('keeps the schema import type-only when runtimeValidation is off', async () => {
    const { implementation, imports } = await generateQuery(
      makeVerbOptions({
        definition: 'Item',
        imports: [{ name: 'Item' }],
        type: 'object',
        runtimeValidation: false,
      }),
      options,
      'react-query',
    );

    expect(implementation).not.toContain('Item.parse(');
    expect(imports).toContainEqual({ name: 'Item' });
    expect(imports).not.toContainEqual(
      expect.objectContaining({ name: 'ItemOutput' }),
    );
  });
});

describe('generateQuery — suspense queryOptions() literal (#4163)', () => {
  const makeVerbOptions = (
    queryOverride: Record<string, unknown> = {},
  ): GeneratorVerbOptions =>
    ({
      verb: 'get',
      route: '/pets',
      pathRoute: '/pets',
      operationId: 'listPets',
      operationName: 'listPets',
      typeName: 'listPets',
      doc: '',
      tags: [],
      response: {
        definition: { success: 'Pets', errors: 'Error' },
        imports: [{ name: 'Pets' }, { name: 'Error' }],
        types: {
          success: [
            {
              key: '200',
              value: 'Pets',
              contentType: 'application/json',
              hasReadonlyProps: false,
              imports: [{ name: 'Pets' }],
              isEnum: false,
              isRef: true,
              schemas: [],
              type: 'object',
              dependencies: [],
            },
          ],
          errors: [],
        },
        contentTypes: ['application/json'],
        schemas: [],
        isBlob: false,
      },
      body: {
        definition: '',
        implementation: '',
        imports: [],
        schemas: [],
        formData: undefined,
        formUrlEncoded: undefined,
        contentType: '',
        isOptional: true,
        originalSchema: {},
        isBlob: false,
      },
      params: [],
      props: [],
      override: {
        formData: { disabled: false, arrayHandling: 'serialize' },
        formUrlEncoded: false,
        requestOptions: true,
        fetch: {
          includeHttpResponseReturnType: false,
          forceSuccessResponse: false,
          runtimeValidation: { enabled: false, strategy: 'throw' },
        },
        query: {
          useQuery: false,
          useMutation: false,
          useInfinite: false,
          useSuspenseQuery: true,
          useSuspenseInfiniteQuery: false,
          usePrefetch: false,
          useInvalidate: false,
          shouldExportKeys: true,
          shouldExportHttpClient: true,
          shouldExportMutatorHooks: true,
          signal: false,
          version: 5,
          ...queryOverride,
        },
      },
      originalOperation: {},
    }) as unknown as GeneratorVerbOptions;

  const options = createTestGeneratorOptions({
    route: '/pets',
    pathRoute: '/pets',
    context: {
      output: {
        client: OutputClient.REACT_QUERY,
        httpClient: OutputHttpClient.FETCH,
      },
    },
  });

  // `Partial<UseSuspenseQueryOptions<…>>` declares `queryFn` as
  // `QueryFunction<…> | undefined`, so spreading it over a concrete `queryFn`
  // widens the property and `queryOptions()` rejects the literal under
  // `exactOptionalPropertyTypes`. The property has to be re-asserted after the
  // spread, with the caller's value still winning.
  it('re-asserts queryFn after the caller spread', async () => {
    const { implementation } = await generateQuery(
      makeVerbOptions(),
      options,
      'react-query',
    );

    expect(implementation).toContain(
      'queryOptionsBuilder({ queryKey, ...queryOptions, queryFn: queryOptions?.queryFn ?? queryFn})',
    );
    expect(implementation).not.toContain(
      'queryOptionsBuilder({ queryKey, queryFn,',
    );
  });

  it('keeps the plain queryFn when override.query.options is false', async () => {
    const { implementation } = await generateQuery(
      makeVerbOptions({ options: false }),
      options,
      'react-query',
    );

    expect(implementation).toContain('queryOptionsBuilder({ queryKey, queryFn');
    expect(implementation).not.toContain('queryOptions?.queryFn ??');
  });
});

describe('generateQuery — prefetch through queryClient.query() (#4030)', () => {
  const verbOptions = createTestGeneratorVerbOptions({
    verb: 'get',
    route: '/pets',
    pathRoute: '/pets',
    operationId: 'listPets',
    operationName: 'listPets',
    typeName: 'listPets',
    override: {
      query: { useQuery: true, useInfinite: true, usePrefetch: true },
    },
  });

  const generate = (
    client: typeof OutputClient.REACT_QUERY | typeof OutputClient.ANGULAR_QUERY,
    version: string,
  ) => {
    const pkgName =
      client === OutputClient.ANGULAR_QUERY
        ? '@tanstack/angular-query-experimental'
        : '@tanstack/react-query';

    return generateQuery(
      verbOptions,
      createTestGeneratorOptions({
        route: '/pets',
        pathRoute: '/pets',
        context: {
          output: {
            client,
            httpClient:
              client === OutputClient.ANGULAR_QUERY
                ? OutputHttpClient.ANGULAR
                : OutputHttpClient.FETCH,
            packageJson: { resolvedVersions: { [pkgName]: version } },
          },
        },
      }),
      client,
    );
  };

  it.each([OutputClient.REACT_QUERY, OutputClient.ANGULAR_QUERY] as const)(
    '%s: swallows errors from query() / infiniteQuery() on 5.102.0+',
    async (client) => {
      const { implementation } = await generate(client, '5.102.0');

      expect(implementation).toContain(
        'await queryClient.query(queryOptions).catch(() => {});',
      );
      expect(implementation).toContain(
        'await queryClient.infiniteQuery(queryOptions).catch(() => {});',
      );
      expect(implementation).not.toContain('queryClient.prefetch');
    },
  );

  it.each([OutputClient.REACT_QUERY, OutputClient.ANGULAR_QUERY] as const)(
    '%s: keeps prefetchQuery / prefetchInfiniteQuery before 5.102.0',
    async (client) => {
      const { implementation } = await generate(client, '5.101.4');

      expect(implementation).toContain(
        'await queryClient.prefetchQuery(queryOptions);',
      );
      expect(implementation).toContain(
        'await queryClient.prefetchInfiniteQuery(queryOptions);',
      );
      expect(implementation).not.toContain('queryClient.query(');
    },
  );
});

describe('generateQueryHeader SecondParameter helper (#4388)', () => {
  const clientImplementation =
    'export const listItems = (options?: SecondParameter<typeof customFetch>) => {};';
  const params = {
    title: 'Api',
    isMutator: true,
    isGlobalMutator: true,
    provideIn: false as const,
    hasAwaitedType: true,
    output: { httpClient: OutputHttpClient.AXIOS },
    verbOptions: {},
  };

  it('declares the helper when an operation override references it', () => {
    const header = generateQueryHeader({
      ...params,
      isRequestOptions: false,
      clientImplementation,
    } as never);
    const implementation =
      typeof header === 'string' ? header : header.implementation;

    expect(implementation).toContain('type SecondParameter<');
  });

  it('omits the helper when nothing references it', () => {
    const header = generateQueryHeader({
      ...params,
      isRequestOptions: false,
      clientImplementation: '',
    } as never);
    const implementation =
      typeof header === 'string' ? header : header.implementation;

    expect(implementation).not.toContain('type SecondParameter<');
  });
});

describe('generateQuery — operation docs on every hook signature (#4399)', () => {
  const operationDoc = jsDoc({
    description: 'Retrieves the unique operator facility.',
    summary: 'Get operator facility',
  });

  const generate = (
    verb: 'get' | 'post',
    doc: string,
    docs?: { global?: { route?: boolean }; operation?: { route?: boolean } },
  ) =>
    generateQuery(
      createTestGeneratorVerbOptions({
        verb,
        route: '/facilities/operator',
        pathRoute: '/facilities/operator',
        operationId: 'getOperatorFacility',
        operationName: 'getOperatorFacility',
        typeName: 'getOperatorFacility',
        summary: 'Get operator facility',
        doc,
        override: {
          query: {
            useQuery: verb === 'get',
            useSuspenseQuery: true,
            useMutation: verb === 'post',
            ...(docs?.global ? { docs: docs.global } : {}),
          },
        },
      }),
      createTestGeneratorOptions({
        route: '/facilities/operator',
        pathRoute: '/facilities/operator',
        ...(docs?.operation
          ? {
              override: {
                operations: {
                  getOperatorFacility: { query: { docs: docs.operation } },
                },
              },
            }
          : {}),
        context: {
          output: {
            client: OutputClient.REACT_QUERY,
            httpClient: OutputHttpClient.FETCH,
            packageJson: {
              resolvedVersions: { '@tanstack/react-query': '5.90.0' },
            },
          },
        },
      }),
      OutputClient.REACT_QUERY,
    );

  const hookSignatures = (implementation: string) =>
    implementation.match(/export function use\w+</g) ?? [];
  const documentedHookSignatures = (implementation: string, doc: string) =>
    implementation
      .split(doc)
      .slice(1)
      .filter((after) => /^\s*export function use\w+</.test(after));

  it('documents each overload and the implementation of query and suspense hooks', async () => {
    const { implementation } = await generate('get', operationDoc);

    // useQuery and useSuspenseQuery: three overloads plus the implementation each
    expect(hookSignatures(implementation)).toHaveLength(8);
    expect(documentedHookSignatures(implementation, operationDoc)).toHaveLength(
      8,
    );
  });

  it('gives the mutation hook the description as well as the summary', async () => {
    const { implementation } = await generate('post', operationDoc);

    expect(implementation).toContain(
      `${operationDoc}export const useGetOperatorFacility =`,
    );
  });

  it('emits no comment on the hooks when the operation has no docs', async () => {
    const { implementation } = await generate('get', '');

    expect(hookSignatures(implementation)).toHaveLength(8);
    expect(implementation).not.toContain('/**');
  });

  const routedDoc = `/**
 * Retrieves the unique operator facility.
 * @summary Get operator facility
 * @route GET /facilities/operator
 */
`;

  it('adds the method and path to every hook signature with docs.route', async () => {
    const { implementation } = await generate('get', operationDoc, {
      global: { route: true },
    });

    expect(documentedHookSignatures(implementation, routedDoc)).toHaveLength(8);
  });

  it('adds the route to the mutation hook', async () => {
    const { implementation } = await generate('post', operationDoc, {
      global: { route: true },
    });

    expect(implementation).toContain(
      `${routedDoc.replace('GET', 'POST')}export const useGetOperatorFacility =`,
    );
  });

  it('leaves the route out by default and when an operation turns it off', async () => {
    const byDefault = await generate('get', operationDoc);
    const turnedOff = await generate('get', operationDoc, {
      global: { route: true },
      operation: { route: false },
    });

    expect(byDefault.implementation).not.toContain('@route');
    expect(turnedOff.implementation).not.toContain('@route');
  });

  it('lets an operation turn the route on when the global option is off', async () => {
    const { implementation } = await generate('get', operationDoc, {
      operation: { route: true },
    });

    expect(documentedHookSignatures(implementation, routedDoc)).toHaveLength(8);
  });
});

describe('addRouteToDoc', () => {
  it('appends the tag inside an existing block', () => {
    expect(
      addRouteToDoc(jsDoc({ summary: 'List pets' }), 'get', '/pets/{petId}'),
    ).toBe('/**\n * @summary List pets\n * @route GET /pets/{petId}\n */\n');
  });

  it('renders a block of its own when the operation has no docs', () => {
    expect(addRouteToDoc('', 'delete', '/pets/{petId}')).toBe(
      '/**\n * @route DELETE /pets/{petId}\n */\n',
    );
  });

  it('cannot close the comment early through the path', () => {
    expect(addRouteToDoc('', 'get', '/a*/b')).toBe(
      String.raw`/**
 * @route GET /a*\/b
 */
`,
    );
  });
});
