export interface SellerInterface {
  sysId: string,
  username: string
}

export interface AppStateInterface {
  activationCode: string,
  isActivated: boolean,
  isAvailable: boolean,
  sellers?: SellerInterface[],
}

export interface ActivationFormProps {
  state: AppStateInterface,
  setState: any
}

export interface SellersListProps {
  sellers: SellerInterface[]
}

export interface SellerProps {
  seller: SellerInterface
}

export interface ActivateFormData {
  activatedCode: string
}
