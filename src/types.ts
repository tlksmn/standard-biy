import {Dispatch, SetStateAction} from "react";

export interface SellerInterface {
  sysId: string,
  username: string,
  id: number
}

export interface AppStateInterface {
  user: string,
  userId: number
  activationCode: string,
  isActivated: boolean,
  isAvailable: boolean,
  sellers?: SellerInterface[],
}

export interface ActivationFormProps {
  state: AppStateInterface,
  setState: Dispatch<SetStateAction<AppStateInterface>>,
}

export interface SellersListProps {
  sellers: SellerInterface[],
  fetchState: boolean,
  setFetchState: Dispatch<SetStateAction<boolean>>,
  selectedSeller: SellerInterface,
  selectSeller: Dispatch<SetStateAction<SellerInterface>>,
}

export interface SellerProps {
  seller: SellerInterface,
  selectedSeller: SellerInterface,
  selectSeller: Dispatch<SetStateAction<SellerInterface>>,
  fetchState: boolean,
  setFetchState: Dispatch<SetStateAction<boolean>>,
}

export interface ActivateFormData {
  activatedCode: string,
}

// @Api
export interface ActivateApiData {
  id: number
  name: string
  activated: boolean
  sellers: SellerApiI[]
}

interface SellerApiI {
  id: number,
  sysId: string,
  username: string
}

export interface ApiError {
  error: string
  message: string[]
  statusCode: number
}

export interface ApiRivalConfigResponseI {
  total: number
  list: RivalResponse[]
}

interface RivalResponse {
  id: number
  city: {
    code: string
  }
  product: {
    sku: string
  }
}

export type PriceListApiT = {
  deliveryDurationFacetValues: Record<string, number>;
  offers: ProductSellerT[];
  offersCount: number;
  total: number;
};

export type ProductSellerT = {
  availabilityDate: string;
  delivery: string;
  deliveryDuration: string;
  deliverySteps: Record<any, any>;
  deliveryType: string;
  kaspiDelivery: boolean;
  kdDestinationCity: string; //cityId delivery
  kdPickupDate: string;
  kdPoints: string[];
  kdTimeoutDelivery: string;
  kdTimeoutPickup: string;
  locatedInCity: string; // cityId Replacement
  locatedInPoint: string;
  masterCategory: string;
  masterSku: string;
  merchantId: string; // seller id
  merchantName: string; //seller name
  merchantRating: string; //seller rating
  merchantReviewsQuantity: number; // seller reviewer count
  preorder: number;
  price: number;
};

export interface ProductAnalyzerStateI {
  productSku: string;
  cityId: string;
  category: string[];
}
