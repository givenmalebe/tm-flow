import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface Addendum_Key {
  id: UUIDString;
  __typename?: 'Addendum_Key';
}

export interface BidDocument_Key {
  id: UUIDString;
  __typename?: 'BidDocument_Key';
}

export interface Bid_Key {
  id: UUIDString;
  __typename?: 'Bid_Key';
}

export interface BidderCompany_Key {
  id: UUIDString;
  __typename?: 'BidderCompany_Key';
}

export interface BidderMember_Key {
  id: UUIDString;
  __typename?: 'BidderMember_Key';
}

export interface Briefing_Key {
  id: UUIDString;
  __typename?: 'Briefing_Key';
}

export interface ChecklistItem_Key {
  id: UUIDString;
  __typename?: 'ChecklistItem_Key';
}

export interface Communication_Key {
  id: UUIDString;
  __typename?: 'Communication_Key';
}

export interface CompanyMember_Key {
  id: UUIDString;
  __typename?: 'CompanyMember_Key';
}

export interface CompanyProfile_Key {
  id: UUIDString;
  __typename?: 'CompanyProfile_Key';
}

export interface CompleteOnboardingData {
  user_update?: User_Key | null;
}

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

export interface CreateTenderVariables {
  referenceNumber: string;
  title: string;
  clientCompany: string;
  description?: string | null;
  scopeOfWork?: string | null;
  category?: string | null;
  closingDate?: DateString | null;
}

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

export interface DeleteTenderVariables {
  id: UUIDString;
}

export interface GeneratedDocument_Key {
  id: UUIDString;
  __typename?: 'GeneratedDocument_Key';
}

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

export interface GetTenderVariables {
  id: UUIDString;
}

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

export interface IssuedTender_Key {
  id: UUIDString;
  __typename?: 'IssuedTender_Key';
}

export interface IssuerCompany_Key {
  id: UUIDString;
  __typename?: 'IssuerCompany_Key';
}

export interface LibraryDocument_Key {
  id: UUIDString;
  __typename?: 'LibraryDocument_Key';
}

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

export interface Membership_Key {
  organisationId: UUIDString;
  userId: string;
  __typename?: 'Membership_Key';
}

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

export interface Organisation_Key {
  id: UUIDString;
  __typename?: 'Organisation_Key';
}

export interface PricingVersion_Key {
  id: UUIDString;
  __typename?: 'PricingVersion_Key';
}

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

export interface RegisterUserData {
  user_upsert: User_Key;
  organisation_insert: Organisation_Key;
  membership_insert: Membership_Key;
}

export interface RegisterUserVariables {
  fullName: string;
  organisationName: string;
  companyName?: string | null;
  accountType?: string | null;
}

export interface ReminderSetting_Key {
  id: UUIDString;
  __typename?: 'ReminderSetting_Key';
}

export interface Submission_Key {
  id: UUIDString;
  __typename?: 'Submission_Key';
}

export interface TenderDocument_Key {
  id: UUIDString;
  __typename?: 'TenderDocument_Key';
}

export interface Tender_Key {
  id: UUIDString;
  __typename?: 'Tender_Key';
}

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

export interface User_Key {
  id: string;
  __typename?: 'User_Key';
}

interface RegisterUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: RegisterUserVariables): MutationRef<RegisterUserData, RegisterUserVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: RegisterUserVariables): MutationRef<RegisterUserData, RegisterUserVariables>;
  operationName: string;
}
export const registerUserRef: RegisterUserRef;

export function registerUser(vars: RegisterUserVariables): MutationPromise<RegisterUserData, RegisterUserVariables>;
export function registerUser(dc: DataConnect, vars: RegisterUserVariables): MutationPromise<RegisterUserData, RegisterUserVariables>;

interface CreateTenderRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateTenderVariables): MutationRef<CreateTenderData, CreateTenderVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateTenderVariables): MutationRef<CreateTenderData, CreateTenderVariables>;
  operationName: string;
}
export const createTenderRef: CreateTenderRef;

export function createTender(vars: CreateTenderVariables): MutationPromise<CreateTenderData, CreateTenderVariables>;
export function createTender(dc: DataConnect, vars: CreateTenderVariables): MutationPromise<CreateTenderData, CreateTenderVariables>;

interface UpdateTenderRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateTenderVariables): MutationRef<UpdateTenderData, UpdateTenderVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateTenderVariables): MutationRef<UpdateTenderData, UpdateTenderVariables>;
  operationName: string;
}
export const updateTenderRef: UpdateTenderRef;

export function updateTender(vars: UpdateTenderVariables): MutationPromise<UpdateTenderData, UpdateTenderVariables>;
export function updateTender(dc: DataConnect, vars: UpdateTenderVariables): MutationPromise<UpdateTenderData, UpdateTenderVariables>;

interface DeleteTenderRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: DeleteTenderVariables): MutationRef<DeleteTenderData, DeleteTenderVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: DeleteTenderVariables): MutationRef<DeleteTenderData, DeleteTenderVariables>;
  operationName: string;
}
export const deleteTenderRef: DeleteTenderRef;

export function deleteTender(vars: DeleteTenderVariables): MutationPromise<DeleteTenderData, DeleteTenderVariables>;
export function deleteTender(dc: DataConnect, vars: DeleteTenderVariables): MutationPromise<DeleteTenderData, DeleteTenderVariables>;

interface CompleteOnboardingRef {
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<CompleteOnboardingData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): MutationRef<CompleteOnboardingData, undefined>;
  operationName: string;
}
export const completeOnboardingRef: CompleteOnboardingRef;

export function completeOnboarding(): MutationPromise<CompleteOnboardingData, undefined>;
export function completeOnboarding(dc: DataConnect): MutationPromise<CompleteOnboardingData, undefined>;

interface MeRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MeData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<MeData, undefined>;
  operationName: string;
}
export const meRef: MeRef;

export function me(options?: ExecuteQueryOptions): QueryPromise<MeData, undefined>;
export function me(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MeData, undefined>;

interface HasOrganisationRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<HasOrganisationData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<HasOrganisationData, undefined>;
  operationName: string;
}
export const hasOrganisationRef: HasOrganisationRef;

export function hasOrganisation(options?: ExecuteQueryOptions): QueryPromise<HasOrganisationData, undefined>;
export function hasOrganisation(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<HasOrganisationData, undefined>;

interface MyOrganisationRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<MyOrganisationData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<MyOrganisationData, undefined>;
  operationName: string;
}
export const myOrganisationRef: MyOrganisationRef;

export function myOrganisation(options?: ExecuteQueryOptions): QueryPromise<MyOrganisationData, undefined>;
export function myOrganisation(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<MyOrganisationData, undefined>;

interface ListTendersRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListTendersData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListTendersData, undefined>;
  operationName: string;
}
export const listTendersRef: ListTendersRef;

export function listTenders(options?: ExecuteQueryOptions): QueryPromise<ListTendersData, undefined>;
export function listTenders(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListTendersData, undefined>;

interface GetTenderRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetTenderVariables): QueryRef<GetTenderData, GetTenderVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetTenderVariables): QueryRef<GetTenderData, GetTenderVariables>;
  operationName: string;
}
export const getTenderRef: GetTenderRef;

export function getTender(vars: GetTenderVariables, options?: ExecuteQueryOptions): QueryPromise<GetTenderData, GetTenderVariables>;
export function getTender(dc: DataConnect, vars: GetTenderVariables, options?: ExecuteQueryOptions): QueryPromise<GetTenderData, GetTenderVariables>;

interface PublicIssuedTendersRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<PublicIssuedTendersData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<PublicIssuedTendersData, undefined>;
  operationName: string;
}
export const publicIssuedTendersRef: PublicIssuedTendersRef;

export function publicIssuedTenders(options?: ExecuteQueryOptions): QueryPromise<PublicIssuedTendersData, undefined>;
export function publicIssuedTenders(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<PublicIssuedTendersData, undefined>;

