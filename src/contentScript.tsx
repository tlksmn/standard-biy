import axios, {InternalAxiosRequestConfig} from "axios";
import React, {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState
} from "react";
import {createRoot} from "react-dom/client";

import {
  ActivateApiData,
  ActivationFormProps,
  ApiError,
  ApiRivalConfigResponseI,
  AppStateInterface, City, PercentData, PercentDataApi,
  PriceListApiT,
  ProductAnalyzerStateI,
  SellerInterface,
  SellerProps,
  SellersListProps
} from "./types";
import {cityListConstants, KaspiPercents} from "./constats";


export function percentInt(per: string): number {
  let temp = '';
  for (let i = 0; i < per?.length; i++) {
    const model = per[i]
    if (model === '.' || model === ',') {
      break;
    }
    if (!isNaN(Number(model))) {
      temp = temp + model;
    }
  }
  return parseInt(temp);
}

//--lib-start to fetch current product
function getProductInfo(sku: string, cityId: string): Promise<PriceListApiT & ApiError> {
  return axios.request({
    url: `https://kaspi.kz/yml/offer-view/offers/${sku}`,
    method: 'post',
    data: {
      cityId: cityId,
      id: sku,
      merchantUID: "",
      limit: 10,
      page: 0,
      sort: true,
      installationId: "-1",
      zoneId: 'Magnum_ZONE1'
    },
  }).then(response => response.data as PriceListApiT & ApiError)
}

//--leb-end
//---- biy-ext-standard-start
/***
 *
 *
 * */
const API_URL: string = 'https://ext.biy.kz' /*'http://localhost:3001'*/;
const storageName: string = 'BIY_STANDARD_EXT';

/***
 *
 *
 * */


function App() {
  const [fetchQueueState, setFetchQueueState] = useState<boolean>(false);
  const [dataToFetch, setDataToFetch] = useState<ApiRivalConfigResponseI>();
  const [dataCounter, setDataCounter] = useState<number>(0);
  const [dataFetchState, setDataFetchState] = useState(0);
  const [selectedSellerState, setSelectedSeller] = useState<SellerInterface>({
    sysId: '',
    username: '',
    id: 0
  });
  const [appState, setAppState] = useState<AppStateInterface>({
    user: '',
    userId: 0,
    activationCode: '',
    isActivated: false,
    isAvailable: false,
    sellers: []
  });

  useEffect(() => {
    (async function InitializeApp() {
      const data: AppStateInterface = await chrome.storage.local.get(storageName).then((value) => value[storageName] || {})
      setAppState(data);
    })().then()
  }, [])

  useEffect(() => {
    (async function saveAppStateToLocalStorage() {
      await chrome.storage.local.set({BIY_STANDARD_EXT: appState})
      const data = await chrome.storage.local.get(storageName)
    })().then()
  }, [appState])

  function setDefaultConfig() {
    setSelectedSeller({
      sysId: '',
      username: '',
      id: 0
    });
    setFetchQueueState(false);
    setDataToFetch(undefined);
  }

  useEffect(() => {
    if (fetchQueueState && selectedSellerState.username.length > 0 && selectedSellerState.sysId.length > 0) {
      axios.request({
        url: `${API_URL}/list/${selectedSellerState.sysId}`,
        method: "get",
      })
        .then(response => response.data as ApiRivalConfigResponseI & ApiError)
        .then(data => {
          if (data.statusCode > 399) throw data.error;
          setDataToFetch(data);
        })
    }
  }, [fetchQueueState, selectedSellerState])


  async function fetchData(data: ApiRivalConfigResponseI) {
    if (data.total < 1) return;
    let errorStatus: boolean = false
    for (const elem of data.list) {
      setDataFetchState(1);
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(0);
        }, 200)
      });
      let data: PriceListApiT & ApiError;
      try {
        data = await getProductInfo(elem.product.sku, elem.city.code);
      } catch (e) {
        setDataFetchState(3);
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(0);
          }, 10_000)
        })
        continue;
      }
      if (data.total === 0) {
        errorStatus = true;
        setDataFetchState(5);
        break;
      }
      if (data.statusCode > 399) {
        alert(data.error);
      }
      setDataFetchState(2);
      try {
        await axios.request({
          url: `${API_URL}/update`, method: "post", data: {
            data: data,
            id: elem.id,
            sellerId: selectedSellerState.id,
            hash: appState.activationCode
          }
        })
      } catch (e) {
        setDataFetchState(3);
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve(0);
          }, 10_000)
        })
        continue;
      }

      setDataCounter((prev) => prev + 1);
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(0)
        }, 200)
      })
    }
    if (!errorStatus) {
      setDataFetchState(3);
      setTimeout(() => {
        setDataFetchState(0);
      }, 3_000)
    }
  }

  useEffect(() => {
    if (dataToFetch?.total! > 0) {
      (async () => {
        await fetchData(dataToFetch!)
        setDefaultConfig()
      })()
    }
  }, [dataToFetch])

  function onLogoutButtonClick() {
    setAppState({
      user: '',
      userId: 0,
      activationCode: '',
      isActivated: false,
      isAvailable: false,
      sellers: []
    });
  }

  return <div id='app'>
    {
      !appState.isActivated && !appState.isAvailable ?
        <ActivateForm state={appState} setState={setAppState}/> :
        <SellersList
          selectSeller={setSelectedSeller}
          selectedSeller={selectedSellerState}
          setFetchState={setFetchQueueState}
          fetchState={fetchQueueState}
          sellers={appState.sellers || []}/>
    }
    {
      appState.isAvailable &&
      <div>
        <button className='button _red' disabled={fetchQueueState}
                onClick={onLogoutButtonClick}>Выйти
        </button>
      </div>
    }
    {dataFetchState === 5 && <div>Ваши запросы были заблокированы</div>}
    {
      fetchQueueState && <div>
        <div className='info'>Идёт интеграция; Пожалуйста ждите-)</div>
        {dataToFetch?.total! > 0 && <div>
          <div>Всего {dataToFetch?.total} товаров будет обновлено))</div>
          <div style={{'color': 'green'}}>Уже обновлено {dataCounter}</div>
          {dataFetchState === 1 &&
            <div style={{color: 'darkred'}}>Получение данных</div>}
          {dataFetchState === 2 &&
            <div style={{color: 'blue'}}>Отправка данных</div>}
          {dataFetchState === 3 &&
            <div>Возникла ошибка; через 10 секунда будет следующий цикл</div>}
          {dataFetchState === 4 &&
            <div style={{color: 'green'}}>Ура все данные синхронизвалсь!)</div>}
          {dataFetchState === 5 && <div>Ваши запросы были заблокированы</div>}
        </div>
        }
        <LoaderComponent/>
      </div>
    }
  </div>
}

function ActivateForm(props: ActivationFormProps) {
  const [errorState, setErrorState] = useState<boolean>(false);
  const [fetchState, setFetchState] = useState<boolean>(false);
  const [chanceCount, setChanceCount] = useState<number>(0)
  const activationCodeRef = useRef<HTMLInputElement>(null);
  const regExp = new RegExp(/^biy_ext:.*$/)

  const onActivateFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const codeValue = activationCodeRef.current!.value;
    setFetchState(true);
    if (codeValue.length > 10 && regExp.test(codeValue)) {
      axios.request({
        url: `${API_URL}/activate`,
        method: 'post',
        data: {hash: codeValue}
      })
        .then(response => response.data as ActivateApiData & ApiError)
        .then((data) => {
          if (data.statusCode > 399) {
            throw data.error;
          }
          props.setState({
            user: data.name,
            userId: data.id,
            activationCode: codeValue,
            isActivated: data.activated,
            isAvailable: true,
            sellers: data.sellers,
          });
        })
        .catch(e => {
          alert(e)
          setChanceCount((val) => val + 1)
          setFetchState(false);
          setErrorState(true);
          setTimeout(() => {
            setErrorState(false);
          }, 4_000);
        })
    } else {
      setChanceCount((val) => val + 1)
      setErrorState(true);
      setFetchState(false);
    }
  }
  return <form onSubmit={onActivateFormSubmit}>
    <label htmlFor="activationCode">Код активации</label>
    <input id="activationCode" ref={activationCodeRef} type='text'/>
    <button className='button' disabled={fetchState || chanceCount > 4}
            type="submit">Активировать
    </button>
    {
      errorState && <div className='error'>
        {
          activationCodeRef.current!.value.length < 10 &&
          <div>Недостаточная длина кода!</div>
        }
        <div>
          Ошибка! Указанный код уже зарегистрирован, используется или не
          корректен)
        </div>
      </div>
    }
    {fetchState && <LoaderComponent/>}
  </form>
}

function SellersList(props: SellersListProps) {
  return (
    <div className="seller-list-container">
      {
        props.sellers.map((e) => (
            <div key={e.sysId}>
              <SellerComponent
                selectSeller={props.selectSeller}
                fetchState={props.fetchState}
                setFetchState={props.setFetchState}
                selectedSeller={props.selectedSeller}
                seller={e}/>
            </div>
          )
        )
      }
    </div>
  );
}

function LoaderComponent() {
  return <div className='loader'>
    <svg version="1.1" id="L9" xmlns="http://www.w3.org/2000/svg"
         xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
         viewBox="0 0 100 100" enableBackground="new 0 0 0 0"
         xmlSpace="preserve">
      <rect x="10" y="50" width="8" height="14" fill="#333">
        <animateTransform attributeType="xml"
                          attributeName="transform" type="translate"
                          values="0 0; 0 20; 0 0"
                          begin="0" dur="0.6s" repeatCount="indefinite"/>
      </rect>
      <rect x="30" y="50" width="8" height="14" fill="#333">
        <animateTransform attributeType="xml"
                          attributeName="transform" type="translate"
                          values="0 0; 0 20; 0 0"
                          begin="0.2s" dur="0.6s" repeatCount="indefinite"/>
      </rect>
      <rect x="50" y="50" width="8" height="14" fill="#333">
        <animateTransform attributeType="xml"
                          attributeName="transform" type="translate"
                          values="0 0; 0 20; 0 0"
                          begin="0.4s" dur="0.6s" repeatCount="indefinite"/>
      </rect>
    </svg>
  </div>
}

function SellerComponent(props: SellerProps) {
  const isSellerSelected = props.selectedSeller.sysId === props.seller.sysId;

  function onSellerClick() {
    if (isSellerSelected || props.fetchState) {
      return;
    }
    props.selectSeller(props.seller);
    props.setFetchState(true)
  }

  return (
    <div>
      <div style={{'color': isSellerSelected ? 'red' : ''}}
           onClick={onSellerClick}>{props.seller.username}</div>
    </div>
  )
}

/***
 *
 *
 * */
//---- biy-ext-standard-end

//---- biy-ext-default-start
/***
 *
 *
 * */
function ApplicationProductAnalyzer() {
  const [productState, setProductState] = useState<ProductAnalyzerStateI>();
  const [productFetchState, setFetchState] = useState<PriceListApiT>();
  const [citySelected, setSelectedCity] = useState<string>();
  const [percentState, setPercent] = useState<number>(0);
  const [productPriceEdit, setProductPriceEdit] = useState(0);
  const percent = () => percentInt(
    KaspiPercents.percents.filter((e: PercentData) => productState?.category.includes(e[3]!))[0]?.percent ||
    KaspiPercents.percents.filter((e: PercentData) => productState?.category.includes(e[2]))[0]?.percent
  );

  useEffect(() => {
    //initialize data --start
    const location = window.location.toString();
    const url = new URL(location);
    const cityIndex = url.searchParams.get('c');
    const productPath = url.pathname.split('/').at(-2);
    const temp = productPath?.split('-');
    const productId = temp?.at(-1);
    const productFullName = document.getElementsByClassName('item__heading')[0]?.textContent!.trim();
    const currentProductId = document.getElementsByClassName('item__sku')[0]?.textContent?.split(': ')[1];
    const lastCategory = document.querySelector("#breadcrumb > div > div > div:nth-child(4) > a")?.textContent?.trim()
    const preLastCategory = document.querySelector("#breadcrumb > div > div > div:nth-child(3) > a > span")?.textContent?.trim()
    const cityId = cityIndex || '750000000';
    //initialize data --end

    setProductState({
      productSku: productId || currentProductId || '',
      cityId: cityId,
      category: [preLastCategory!, lastCategory!].filter((e) => e),
      productName: productFullName
    })

    setSelectedCity(cityId);
  }, []);

  useEffect(() => {
    if (productState?.category?.length! > 0) {
      setPercent(percent)
    }
    if (productState?.cityId && productState?.productSku) {
      (async () => {
        const data = await getProductInfo(productState.productSku, productState.cityId)
        setFetchState(data);
        setProductPriceEdit(data.offers[0].price - 1);
      })().then();
    }
  }, [productState])

  const cityName = (cityId: string): string => cityListConstants.filter((e: City) => e.id === +cityId)[0]?.cityRus || 'Банановый город'

  function onchangeSelect(event: ChangeEvent<HTMLSelectElement>) {
    const cityId: string = event.target.value;
    (async () => {
      setSelectedCity(cityId);
      const data = await getProductInfo(productState!.productSku, cityId);
      setFetchState(data);
      setProductPriceEdit(data.offers[0].price - 1);
    })().then();
  }

  function onProductPriceChange(event: ChangeEvent<HTMLInputElement>) {
    setProductPriceEdit(+event.target.value);
  }

  return <div>
    <div className='productContainer'>
      <div><a href="https://mp.biy.kz/auth" target="_blank">biy.kz</a> -
        полезный инструмента для вашего бизнеса
      </div>
      {
        productState?.productSku && productState?.productName && productState?.cityId &&
        <div>
          <div> {productState.productName} </div>
          <div>Категория :: {productState.category.map(e => e + ' ')}</div>
          <div>Комиссионные с продажи = {percentState}% =
            ₸{Math.ceil((productPriceEdit / 100) * percentState)}</div>
          <select name="citySelected" id="citySelect" onChange={onchangeSelect}
                  value={citySelected}>
            {
              cityListConstants.map((e: City) => (
                <option key={e.cityRus} value={e.id}>{e.cityRus}</option>)
              )
            }
          </select>
          <input type="number" value={productPriceEdit}
                 onChange={onProductPriceChange}/>
          <div>Рекомендуемая цена :: ₸{productPriceEdit} - и место в
            списке {(productFetchState?.offers.filter(e => e.price < productPriceEdit).length)! + 1}</div>
        </div>
      }
    </div>
    <div>всего продавцов {productFetchState?.total}</div>
    <div className='cityList'>
      {
        productFetchState?.offers?.map((e) => (
          <div key={e.merchantName} className='cityElement'>
            <div>
              {e.merchantName} -
              ₸{e.price} - {e.preorder} - {e.deliveryDuration} - {cityName(e.locatedInCity || e.kdDestinationCity)}
            </div>
          </div>
        ))
      }
    </div>
    <div>полезный инструмента для вашего бизнеса <a
      href="https://mp.biy.kz/auth" target="_blank">biy.kz</a></div>
  </div>
}

/***
 *
 *
 * */
//---- biy-ext-default-start

function main() {
  const rootHtml = document.createElement('div');
  rootHtml.setAttribute('id', 'biy-ext');
  const RootAppendedHtml = document.body.appendChild(rootHtml);

  const BiyStandardExtRoot = document.createElement('div');
  BiyStandardExtRoot.setAttribute('id', 'biy-ext-standard-root')
  BiyStandardExtRoot.setAttribute('class', 'ext')
  RootAppendedHtml.appendChild(BiyStandardExtRoot);
  const reactRoot = createRoot(BiyStandardExtRoot);
  reactRoot.render(<App/>);

  const BiyProductAnalyzerRoot = document.createElement('div');
  BiyProductAnalyzerRoot.setAttribute('id', 'biy-ext-prod-calc-analyzer');
  BiyProductAnalyzerRoot.setAttribute('class', 'ext');
  RootAppendedHtml.appendChild(BiyProductAnalyzerRoot);
  setTimeout(() => {
    const reactSecondRoot = createRoot(BiyProductAnalyzerRoot);
    reactSecondRoot.render(<ApplicationProductAnalyzer/>);
  }, 700)
}

main()
