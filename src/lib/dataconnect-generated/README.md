# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `tmflow`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*Me*](#me)
  - [*HasOrganisation*](#hasorganisation)
  - [*MyOrganisation*](#myorganisation)
  - [*ListTenders*](#listtenders)
  - [*GetTender*](#gettender)
  - [*PublicIssuedTenders*](#publicissuedtenders)
- [**Mutations**](#mutations)
  - [*RegisterUser*](#registeruser)
  - [*CreateTender*](#createtender)
  - [*UpdateTender*](#updatetender)
  - [*DeleteTender*](#deletetender)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `tmflow`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `tmflow` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## Me
You can execute the `Me` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
me(options?: ExecuteQueryOptions): QueryPromise<MeData, undefined>;

interface MeRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MeData, undefined>;
}
export const meRef: MeRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
me(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MeData, undefined>;

interface MeRef {
  ...
  (dc: DataConnect): QueryRef<MeData, undefined>;
}
export const meRef: MeRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the meRef:
```typescript
const name = meRef.operationName;
console.log(name);
```

### Variables
The `Me` query has no variables.
### Return Type
Recall that executing the `Me` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MeData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface MeData {
  user?: {
    id: string;
    email: string;
    fullName: string;
    companyName?: string | null;
    role: string;
    accountType: string;
    onboardingCompleted: boolean;
  } & User_Key;
}
```
### Using `Me`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, me } from '@dataconnect/generated';


// Call the `me()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await me();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await me(dataConnect);

console.log(data.user);

// Or, you can use the `Promise` API.
me().then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

### Using `Me`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, meRef } from '@dataconnect/generated';


// Call the `meRef()` function to get a reference to the query.
const ref = meRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = meRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.user);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

## HasOrganisation
You can execute the `HasOrganisation` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
hasOrganisation(options?: ExecuteQueryOptions): QueryPromise<HasOrganisationData, undefined>;

interface HasOrganisationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<HasOrganisationData, undefined>;
}
export const hasOrganisationRef: HasOrganisationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
hasOrganisation(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<HasOrganisationData, undefined>;

interface HasOrganisationRef {
  ...
  (dc: DataConnect): QueryRef<HasOrganisationData, undefined>;
}
export const hasOrganisationRef: HasOrganisationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the hasOrganisationRef:
```typescript
const name = hasOrganisationRef.operationName;
console.log(name);
```

### Variables
The `HasOrganisation` query has no variables.
### Return Type
Recall that executing the `HasOrganisation` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `HasOrganisationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface HasOrganisationData {
  user?: {
    memberships_on_user: ({
      organisation: {
        id: UUIDString;
        name: string;
      } & Organisation_Key;
    })[];
  };
}
```
### Using `HasOrganisation`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, hasOrganisation } from '@dataconnect/generated';


// Call the `hasOrganisation()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await hasOrganisation();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await hasOrganisation(dataConnect);

console.log(data.user);

// Or, you can use the `Promise` API.
hasOrganisation().then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

### Using `HasOrganisation`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, hasOrganisationRef } from '@dataconnect/generated';


// Call the `hasOrganisationRef()` function to get a reference to the query.
const ref = hasOrganisationRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = hasOrganisationRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.user);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

## MyOrganisation
You can execute the `MyOrganisation` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
myOrganisation(options?: ExecuteQueryOptions): QueryPromise<MyOrganisationData, undefined>;

interface MyOrganisationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyOrganisationData, undefined>;
}
export const myOrganisationRef: MyOrganisationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
myOrganisation(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyOrganisationData, undefined>;

interface MyOrganisationRef {
  ...
  (dc: DataConnect): QueryRef<MyOrganisationData, undefined>;
}
export const myOrganisationRef: MyOrganisationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the myOrganisationRef:
```typescript
const name = myOrganisationRef.operationName;
console.log(name);
```

### Variables
The `MyOrganisation` query has no variables.
### Return Type
Recall that executing the `MyOrganisation` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `MyOrganisationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface MyOrganisationData {
  user?: {
    memberships_on_user: ({
      role: string;
      organisation: {
        id: UUIDString;
        name: string;
      } & Organisation_Key;
    })[];
  };
}
```
### Using `MyOrganisation`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, myOrganisation } from '@dataconnect/generated';


// Call the `myOrganisation()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await myOrganisation();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await myOrganisation(dataConnect);

console.log(data.user);

// Or, you can use the `Promise` API.
myOrganisation().then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

### Using `MyOrganisation`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, myOrganisationRef } from '@dataconnect/generated';


// Call the `myOrganisationRef()` function to get a reference to the query.
const ref = myOrganisationRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = myOrganisationRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.user);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

## ListTenders
You can execute the `ListTenders` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listTenders(options?: ExecuteQueryOptions): QueryPromise<ListTendersData, undefined>;

interface ListTendersRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListTendersData, undefined>;
}
export const listTendersRef: ListTendersRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listTenders(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListTendersData, undefined>;

interface ListTendersRef {
  ...
  (dc: DataConnect): QueryRef<ListTendersData, undefined>;
}
export const listTendersRef: ListTendersRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listTendersRef:
```typescript
const name = listTendersRef.operationName;
console.log(name);
```

### Variables
The `ListTenders` query has no variables.
### Return Type
Recall that executing the `ListTenders` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListTendersData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListTendersData {
  user?: {
    memberships_on_user: ({
      organisation: {
        tenders_on_organisation: ({
          id: UUIDString;
          referenceNumber: string;
          title: string;
          clientCompany: string;
          status: string;
          closingDate?: DateString | null;
          category?: string | null;
        } & Tender_Key)[];
      };
    })[];
  };
}
```
### Using `ListTenders`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listTenders } from '@dataconnect/generated';


// Call the `listTenders()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listTenders();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listTenders(dataConnect);

console.log(data.user);

// Or, you can use the `Promise` API.
listTenders().then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

### Using `ListTenders`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listTendersRef } from '@dataconnect/generated';


// Call the `listTendersRef()` function to get a reference to the query.
const ref = listTendersRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listTendersRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.user);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

## GetTender
You can execute the `GetTender` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getTender(vars: GetTenderVariables, options?: ExecuteQueryOptions): QueryPromise<GetTenderData, GetTenderVariables>;

interface GetTenderRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetTenderVariables): QueryRef<GetTenderData, GetTenderVariables>;
}
export const getTenderRef: GetTenderRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getTender(dc: DataConnect, vars: GetTenderVariables, options?: ExecuteQueryOptions): QueryPromise<GetTenderData, GetTenderVariables>;

interface GetTenderRef {
  ...
  (dc: DataConnect, vars: GetTenderVariables): QueryRef<GetTenderData, GetTenderVariables>;
}
export const getTenderRef: GetTenderRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getTenderRef:
```typescript
const name = getTenderRef.operationName;
console.log(name);
```

### Variables
The `GetTender` query requires an argument of type `GetTenderVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetTenderVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `GetTender` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetTenderData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetTenderData {
  user?: {
    memberships_on_user: ({
      organisation: {
        tenders_on_organisation: ({
          id: UUIDString;
          referenceNumber: string;
          title: string;
          clientCompany: string;
          description?: string | null;
          scopeOfWork?: string | null;
          status: string;
          closingDate?: DateString | null;
          tenderDocuments_on_tender: ({
            id: UUIDString;
            filename: string;
            filePath: string;
          } & TenderDocument_Key)[];
          checklistItems_on_tender: ({
            id: UUIDString;
            name: string;
            category?: string | null;
            mandatory: boolean;
            status: string;
          } & ChecklistItem_Key)[];
        } & Tender_Key)[];
      };
    })[];
  };
}
```
### Using `GetTender`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getTender, GetTenderVariables } from '@dataconnect/generated';

// The `GetTender` query requires an argument of type `GetTenderVariables`:
const getTenderVars: GetTenderVariables = {
  id: ..., 
};

// Call the `getTender()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getTender(getTenderVars);
// Variables can be defined inline as well.
const { data } = await getTender({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getTender(dataConnect, getTenderVars);

console.log(data.user);

// Or, you can use the `Promise` API.
getTender(getTenderVars).then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

### Using `GetTender`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getTenderRef, GetTenderVariables } from '@dataconnect/generated';

// The `GetTender` query requires an argument of type `GetTenderVariables`:
const getTenderVars: GetTenderVariables = {
  id: ..., 
};

// Call the `getTenderRef()` function to get a reference to the query.
const ref = getTenderRef(getTenderVars);
// Variables can be defined inline as well.
const ref = getTenderRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getTenderRef(dataConnect, getTenderVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.user);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.user);
});
```

## PublicIssuedTenders
You can execute the `PublicIssuedTenders` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
publicIssuedTenders(options?: ExecuteQueryOptions): QueryPromise<PublicIssuedTendersData, undefined>;

interface PublicIssuedTendersRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<PublicIssuedTendersData, undefined>;
}
export const publicIssuedTendersRef: PublicIssuedTendersRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
publicIssuedTenders(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<PublicIssuedTendersData, undefined>;

interface PublicIssuedTendersRef {
  ...
  (dc: DataConnect): QueryRef<PublicIssuedTendersData, undefined>;
}
export const publicIssuedTendersRef: PublicIssuedTendersRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the publicIssuedTendersRef:
```typescript
const name = publicIssuedTendersRef.operationName;
console.log(name);
```

### Variables
The `PublicIssuedTenders` query has no variables.
### Return Type
Recall that executing the `PublicIssuedTenders` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `PublicIssuedTendersData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface PublicIssuedTendersData {
  issuedTenders: ({
    id: UUIDString;
    referenceNumber: string;
    title: string;
    description?: string | null;
    category?: string | null;
    location?: string | null;
    closingDate?: DateString | null;
    budget?: number | null;
    contractPeriod?: string | null;
    submissionMethod?: string | null;
  } & IssuedTender_Key)[];
}
```
### Using `PublicIssuedTenders`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, publicIssuedTenders } from '@dataconnect/generated';


// Call the `publicIssuedTenders()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await publicIssuedTenders();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await publicIssuedTenders(dataConnect);

console.log(data.issuedTenders);

// Or, you can use the `Promise` API.
publicIssuedTenders().then((response) => {
  const data = response.data;
  console.log(data.issuedTenders);
});
```

### Using `PublicIssuedTenders`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, publicIssuedTendersRef } from '@dataconnect/generated';


// Call the `publicIssuedTendersRef()` function to get a reference to the query.
const ref = publicIssuedTendersRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = publicIssuedTendersRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.issuedTenders);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.issuedTenders);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `tmflow` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## RegisterUser
You can execute the `RegisterUser` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
registerUser(vars: RegisterUserVariables): MutationPromise<RegisterUserData, RegisterUserVariables>;

interface RegisterUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: RegisterUserVariables): MutationRef<RegisterUserData, RegisterUserVariables>;
}
export const registerUserRef: RegisterUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
registerUser(dc: DataConnect, vars: RegisterUserVariables): MutationPromise<RegisterUserData, RegisterUserVariables>;

interface RegisterUserRef {
  ...
  (dc: DataConnect, vars: RegisterUserVariables): MutationRef<RegisterUserData, RegisterUserVariables>;
}
export const registerUserRef: RegisterUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the registerUserRef:
```typescript
const name = registerUserRef.operationName;
console.log(name);
```

### Variables
The `RegisterUser` mutation requires an argument of type `RegisterUserVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface RegisterUserVariables {
  fullName: string;
  organisationName: string;
  companyName?: string | null;
  accountType?: string | null;
}
```
### Return Type
Recall that executing the `RegisterUser` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `RegisterUserData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface RegisterUserData {
  user_upsert: User_Key;
  organisation_insert: Organisation_Key;
  membership_insert: Membership_Key;
}
```
### Using `RegisterUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, registerUser, RegisterUserVariables } from '@dataconnect/generated';

// The `RegisterUser` mutation requires an argument of type `RegisterUserVariables`:
const registerUserVars: RegisterUserVariables = {
  fullName: ..., 
  organisationName: ..., 
  companyName: ..., // optional
  accountType: ..., // optional
};

// Call the `registerUser()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await registerUser(registerUserVars);
// Variables can be defined inline as well.
const { data } = await registerUser({ fullName: ..., organisationName: ..., companyName: ..., accountType: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await registerUser(dataConnect, registerUserVars);

console.log(data.user_upsert);
console.log(data.organisation_insert);
console.log(data.membership_insert);

// Or, you can use the `Promise` API.
registerUser(registerUserVars).then((response) => {
  const data = response.data;
  console.log(data.user_upsert);
  console.log(data.organisation_insert);
  console.log(data.membership_insert);
});
```

### Using `RegisterUser`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, registerUserRef, RegisterUserVariables } from '@dataconnect/generated';

// The `RegisterUser` mutation requires an argument of type `RegisterUserVariables`:
const registerUserVars: RegisterUserVariables = {
  fullName: ..., 
  organisationName: ..., 
  companyName: ..., // optional
  accountType: ..., // optional
};

// Call the `registerUserRef()` function to get a reference to the mutation.
const ref = registerUserRef(registerUserVars);
// Variables can be defined inline as well.
const ref = registerUserRef({ fullName: ..., organisationName: ..., companyName: ..., accountType: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = registerUserRef(dataConnect, registerUserVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_upsert);
console.log(data.organisation_insert);
console.log(data.membership_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_upsert);
  console.log(data.organisation_insert);
  console.log(data.membership_insert);
});
```

## CreateTender
You can execute the `CreateTender` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createTender(vars: CreateTenderVariables): MutationPromise<CreateTenderData, CreateTenderVariables>;

interface CreateTenderRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateTenderVariables): MutationRef<CreateTenderData, CreateTenderVariables>;
}
export const createTenderRef: CreateTenderRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createTender(dc: DataConnect, vars: CreateTenderVariables): MutationPromise<CreateTenderData, CreateTenderVariables>;

interface CreateTenderRef {
  ...
  (dc: DataConnect, vars: CreateTenderVariables): MutationRef<CreateTenderData, CreateTenderVariables>;
}
export const createTenderRef: CreateTenderRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createTenderRef:
```typescript
const name = createTenderRef.operationName;
console.log(name);
```

### Variables
The `CreateTender` mutation requires an argument of type `CreateTenderVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateTenderVariables {
  referenceNumber: string;
  title: string;
  clientCompany: string;
  description?: string | null;
  scopeOfWork?: string | null;
  category?: string | null;
  closingDate?: DateString | null;
}
```
### Return Type
Recall that executing the `CreateTender` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateTenderData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateTenderData {
  callerOrg?: {
    user?: {
      memberships_on_user: ({
        organisation: {
          id: UUIDString;
        } & Organisation_Key;
      })[];
    };
  };
  tender_insert: Tender_Key;
}
```
### Using `CreateTender`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createTender, CreateTenderVariables } from '@dataconnect/generated';

// The `CreateTender` mutation requires an argument of type `CreateTenderVariables`:
const createTenderVars: CreateTenderVariables = {
  referenceNumber: ..., 
  title: ..., 
  clientCompany: ..., 
  description: ..., // optional
  scopeOfWork: ..., // optional
  category: ..., // optional
  closingDate: ..., // optional
};

// Call the `createTender()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createTender(createTenderVars);
// Variables can be defined inline as well.
const { data } = await createTender({ referenceNumber: ..., title: ..., clientCompany: ..., description: ..., scopeOfWork: ..., category: ..., closingDate: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createTender(dataConnect, createTenderVars);

console.log(data.callerOrg);
console.log(data.tender_insert);

// Or, you can use the `Promise` API.
createTender(createTenderVars).then((response) => {
  const data = response.data;
  console.log(data.callerOrg);
  console.log(data.tender_insert);
});
```

### Using `CreateTender`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createTenderRef, CreateTenderVariables } from '@dataconnect/generated';

// The `CreateTender` mutation requires an argument of type `CreateTenderVariables`:
const createTenderVars: CreateTenderVariables = {
  referenceNumber: ..., 
  title: ..., 
  clientCompany: ..., 
  description: ..., // optional
  scopeOfWork: ..., // optional
  category: ..., // optional
  closingDate: ..., // optional
};

// Call the `createTenderRef()` function to get a reference to the mutation.
const ref = createTenderRef(createTenderVars);
// Variables can be defined inline as well.
const ref = createTenderRef({ referenceNumber: ..., title: ..., clientCompany: ..., description: ..., scopeOfWork: ..., category: ..., closingDate: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createTenderRef(dataConnect, createTenderVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.callerOrg);
console.log(data.tender_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.callerOrg);
  console.log(data.tender_insert);
});
```

## UpdateTender
You can execute the `UpdateTender` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateTender(vars: UpdateTenderVariables): MutationPromise<UpdateTenderData, UpdateTenderVariables>;

interface UpdateTenderRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateTenderVariables): MutationRef<UpdateTenderData, UpdateTenderVariables>;
}
export const updateTenderRef: UpdateTenderRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateTender(dc: DataConnect, vars: UpdateTenderVariables): MutationPromise<UpdateTenderData, UpdateTenderVariables>;

interface UpdateTenderRef {
  ...
  (dc: DataConnect, vars: UpdateTenderVariables): MutationRef<UpdateTenderData, UpdateTenderVariables>;
}
export const updateTenderRef: UpdateTenderRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateTenderRef:
```typescript
const name = updateTenderRef.operationName;
console.log(name);
```

### Variables
The `UpdateTender` mutation requires an argument of type `UpdateTenderVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateTenderVariables {
  id: UUIDString;
  referenceNumber: string;
  title: string;
  clientCompany: string;
  description?: string | null;
  scopeOfWork?: string | null;
  category?: string | null;
  closingDate?: DateString | null;
  status: string;
}
```
### Return Type
Recall that executing the `UpdateTender` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateTenderData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateTenderData {
  targetTender?: {
    user?: {
      memberships_on_user: ({
        organisation: {
          tenders_on_organisation: ({
            id: UUIDString;
          } & Tender_Key)[];
        };
      })[];
    };
  };
  tender_update?: Tender_Key | null;
}
```
### Using `UpdateTender`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateTender, UpdateTenderVariables } from '@dataconnect/generated';

// The `UpdateTender` mutation requires an argument of type `UpdateTenderVariables`:
const updateTenderVars: UpdateTenderVariables = {
  id: ..., 
  referenceNumber: ..., 
  title: ..., 
  clientCompany: ..., 
  description: ..., // optional
  scopeOfWork: ..., // optional
  category: ..., // optional
  closingDate: ..., // optional
  status: ..., 
};

// Call the `updateTender()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateTender(updateTenderVars);
// Variables can be defined inline as well.
const { data } = await updateTender({ id: ..., referenceNumber: ..., title: ..., clientCompany: ..., description: ..., scopeOfWork: ..., category: ..., closingDate: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateTender(dataConnect, updateTenderVars);

console.log(data.targetTender);
console.log(data.tender_update);

// Or, you can use the `Promise` API.
updateTender(updateTenderVars).then((response) => {
  const data = response.data;
  console.log(data.targetTender);
  console.log(data.tender_update);
});
```

### Using `UpdateTender`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateTenderRef, UpdateTenderVariables } from '@dataconnect/generated';

// The `UpdateTender` mutation requires an argument of type `UpdateTenderVariables`:
const updateTenderVars: UpdateTenderVariables = {
  id: ..., 
  referenceNumber: ..., 
  title: ..., 
  clientCompany: ..., 
  description: ..., // optional
  scopeOfWork: ..., // optional
  category: ..., // optional
  closingDate: ..., // optional
  status: ..., 
};

// Call the `updateTenderRef()` function to get a reference to the mutation.
const ref = updateTenderRef(updateTenderVars);
// Variables can be defined inline as well.
const ref = updateTenderRef({ id: ..., referenceNumber: ..., title: ..., clientCompany: ..., description: ..., scopeOfWork: ..., category: ..., closingDate: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateTenderRef(dataConnect, updateTenderVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.targetTender);
console.log(data.tender_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.targetTender);
  console.log(data.tender_update);
});
```

## DeleteTender
You can execute the `DeleteTender` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
deleteTender(vars: DeleteTenderVariables): MutationPromise<DeleteTenderData, DeleteTenderVariables>;

interface DeleteTenderRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteTenderVariables): MutationRef<DeleteTenderData, DeleteTenderVariables>;
}
export const deleteTenderRef: DeleteTenderRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
deleteTender(dc: DataConnect, vars: DeleteTenderVariables): MutationPromise<DeleteTenderData, DeleteTenderVariables>;

interface DeleteTenderRef {
  ...
  (dc: DataConnect, vars: DeleteTenderVariables): MutationRef<DeleteTenderData, DeleteTenderVariables>;
}
export const deleteTenderRef: DeleteTenderRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the deleteTenderRef:
```typescript
const name = deleteTenderRef.operationName;
console.log(name);
```

### Variables
The `DeleteTender` mutation requires an argument of type `DeleteTenderVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface DeleteTenderVariables {
  id: UUIDString;
}
```
### Return Type
Recall that executing the `DeleteTender` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `DeleteTenderData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface DeleteTenderData {
  targetTender?: {
    user?: {
      memberships_on_user: ({
        organisation: {
          tenders_on_organisation: ({
            id: UUIDString;
          } & Tender_Key)[];
        };
      })[];
    };
  };
  tender_delete?: Tender_Key | null;
}
```
### Using `DeleteTender`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, deleteTender, DeleteTenderVariables } from '@dataconnect/generated';

// The `DeleteTender` mutation requires an argument of type `DeleteTenderVariables`:
const deleteTenderVars: DeleteTenderVariables = {
  id: ..., 
};

// Call the `deleteTender()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await deleteTender(deleteTenderVars);
// Variables can be defined inline as well.
const { data } = await deleteTender({ id: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await deleteTender(dataConnect, deleteTenderVars);

console.log(data.targetTender);
console.log(data.tender_delete);

// Or, you can use the `Promise` API.
deleteTender(deleteTenderVars).then((response) => {
  const data = response.data;
  console.log(data.targetTender);
  console.log(data.tender_delete);
});
```

### Using `DeleteTender`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, deleteTenderRef, DeleteTenderVariables } from '@dataconnect/generated';

// The `DeleteTender` mutation requires an argument of type `DeleteTenderVariables`:
const deleteTenderVars: DeleteTenderVariables = {
  id: ..., 
};

// Call the `deleteTenderRef()` function to get a reference to the mutation.
const ref = deleteTenderRef(deleteTenderVars);
// Variables can be defined inline as well.
const ref = deleteTenderRef({ id: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = deleteTenderRef(dataConnect, deleteTenderVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.targetTender);
console.log(data.tender_delete);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.targetTender);
  console.log(data.tender_delete);
});
```

