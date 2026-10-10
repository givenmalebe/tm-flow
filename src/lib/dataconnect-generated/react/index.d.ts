import { RegisterUserData, RegisterUserVariables, CreateTenderData, CreateTenderVariables, UpdateTenderData, UpdateTenderVariables, DeleteTenderData, DeleteTenderVariables, CompleteOnboardingData, MeData, HasOrganisationData, MyOrganisationData, ListTendersData, GetTenderData, GetTenderVariables, PublicIssuedTendersData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useRegisterUser(options?: useDataConnectMutationOptions<RegisterUserData, FirebaseError, RegisterUserVariables>): UseDataConnectMutationResult<RegisterUserData, RegisterUserVariables>;
export function useRegisterUser(dc: DataConnect, options?: useDataConnectMutationOptions<RegisterUserData, FirebaseError, RegisterUserVariables>): UseDataConnectMutationResult<RegisterUserData, RegisterUserVariables>;

export function useCreateTender(options?: useDataConnectMutationOptions<CreateTenderData, FirebaseError, CreateTenderVariables>): UseDataConnectMutationResult<CreateTenderData, CreateTenderVariables>;
export function useCreateTender(dc: DataConnect, options?: useDataConnectMutationOptions<CreateTenderData, FirebaseError, CreateTenderVariables>): UseDataConnectMutationResult<CreateTenderData, CreateTenderVariables>;

export function useUpdateTender(options?: useDataConnectMutationOptions<UpdateTenderData, FirebaseError, UpdateTenderVariables>): UseDataConnectMutationResult<UpdateTenderData, UpdateTenderVariables>;
export function useUpdateTender(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateTenderData, FirebaseError, UpdateTenderVariables>): UseDataConnectMutationResult<UpdateTenderData, UpdateTenderVariables>;

export function useDeleteTender(options?: useDataConnectMutationOptions<DeleteTenderData, FirebaseError, DeleteTenderVariables>): UseDataConnectMutationResult<DeleteTenderData, DeleteTenderVariables>;
export function useDeleteTender(dc: DataConnect, options?: useDataConnectMutationOptions<DeleteTenderData, FirebaseError, DeleteTenderVariables>): UseDataConnectMutationResult<DeleteTenderData, DeleteTenderVariables>;

export function useCompleteOnboarding(options?: useDataConnectMutationOptions<CompleteOnboardingData, FirebaseError, void>): UseDataConnectMutationResult<CompleteOnboardingData, undefined>;
export function useCompleteOnboarding(dc: DataConnect, options?: useDataConnectMutationOptions<CompleteOnboardingData, FirebaseError, void>): UseDataConnectMutationResult<CompleteOnboardingData, undefined>;

export function useMe(options?: useDataConnectQueryOptions<MeData>): UseDataConnectQueryResult<MeData, undefined>;
export function useMe(dc: DataConnect, options?: useDataConnectQueryOptions<MeData>): UseDataConnectQueryResult<MeData, undefined>;

export function useHasOrganisation(options?: useDataConnectQueryOptions<HasOrganisationData>): UseDataConnectQueryResult<HasOrganisationData, undefined>;
export function useHasOrganisation(dc: DataConnect, options?: useDataConnectQueryOptions<HasOrganisationData>): UseDataConnectQueryResult<HasOrganisationData, undefined>;

export function useMyOrganisation(options?: useDataConnectQueryOptions<MyOrganisationData>): UseDataConnectQueryResult<MyOrganisationData, undefined>;
export function useMyOrganisation(dc: DataConnect, options?: useDataConnectQueryOptions<MyOrganisationData>): UseDataConnectQueryResult<MyOrganisationData, undefined>;

export function useListTenders(options?: useDataConnectQueryOptions<ListTendersData>): UseDataConnectQueryResult<ListTendersData, undefined>;
export function useListTenders(dc: DataConnect, options?: useDataConnectQueryOptions<ListTendersData>): UseDataConnectQueryResult<ListTendersData, undefined>;

export function useGetTender(vars: GetTenderVariables, options?: useDataConnectQueryOptions<GetTenderData>): UseDataConnectQueryResult<GetTenderData, GetTenderVariables>;
export function useGetTender(dc: DataConnect, vars: GetTenderVariables, options?: useDataConnectQueryOptions<GetTenderData>): UseDataConnectQueryResult<GetTenderData, GetTenderVariables>;

export function usePublicIssuedTenders(options?: useDataConnectQueryOptions<PublicIssuedTendersData>): UseDataConnectQueryResult<PublicIssuedTendersData, undefined>;
export function usePublicIssuedTenders(dc: DataConnect, options?: useDataConnectQueryOptions<PublicIssuedTendersData>): UseDataConnectQueryResult<PublicIssuedTendersData, undefined>;
