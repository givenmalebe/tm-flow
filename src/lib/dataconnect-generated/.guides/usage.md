# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useRegisterUser, useCreateTender, useUpdateTender, useDeleteTender, useCompleteOnboarding, useMe, useHasOrganisation, useMyOrganisation, useListTenders, useGetTender } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useRegisterUser(registerUserVars);

const { data, isPending, isSuccess, isError, error } = useCreateTender(createTenderVars);

const { data, isPending, isSuccess, isError, error } = useUpdateTender(updateTenderVars);

const { data, isPending, isSuccess, isError, error } = useDeleteTender(deleteTenderVars);

const { data, isPending, isSuccess, isError, error } = useCompleteOnboarding();

const { data, isPending, isSuccess, isError, error } = useMe();

const { data, isPending, isSuccess, isError, error } = useHasOrganisation();

const { data, isPending, isSuccess, isError, error } = useMyOrganisation();

const { data, isPending, isSuccess, isError, error } = useListTenders();

const { data, isPending, isSuccess, isError, error } = useGetTender(getTenderVars);

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { registerUser, createTender, updateTender, deleteTender, completeOnboarding, me, hasOrganisation, myOrganisation, listTenders, getTender } from '@dataconnect/generated';


// Operation RegisterUser:  For variables, look at type RegisterUserVars in ../index.d.ts
const { data } = await RegisterUser(dataConnect, registerUserVars);

// Operation CreateTender:  For variables, look at type CreateTenderVars in ../index.d.ts
const { data } = await CreateTender(dataConnect, createTenderVars);

// Operation UpdateTender:  For variables, look at type UpdateTenderVars in ../index.d.ts
const { data } = await UpdateTender(dataConnect, updateTenderVars);

// Operation DeleteTender:  For variables, look at type DeleteTenderVars in ../index.d.ts
const { data } = await DeleteTender(dataConnect, deleteTenderVars);

// Operation CompleteOnboarding: 
const { data } = await CompleteOnboarding(dataConnect);

// Operation Me: 
const { data } = await Me(dataConnect);

// Operation HasOrganisation: 
const { data } = await HasOrganisation(dataConnect);

// Operation MyOrganisation: 
const { data } = await MyOrganisation(dataConnect);

// Operation ListTenders: 
const { data } = await ListTenders(dataConnect);

// Operation GetTender:  For variables, look at type GetTenderVars in ../index.d.ts
const { data } = await GetTender(dataConnect, getTenderVars);


```