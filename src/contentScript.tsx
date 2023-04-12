import axios from "axios";
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


export function percentInt(per: string): number {
  let temp = '';
  for (let i = 0; i < per?.length; i++) {
    if (!isNaN(Number(per[i]))) {
      temp = temp + per[i];
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
      sort: true
    },
    headers: {
      Referer: `https://kaspi.kz/shop/p/${Math.ceil(Math.random() * 100000)}-${sku}/?c=${cityId}`,
    },
  }).then(response => response.data as PriceListApiT & ApiError)
}

//--leb-end
//---- biy-ext-standard-start
/***
 *
 *
 * */
const API_URL = 'https://ext.biy.kz';
const storageName = 'BIY_STANDARD_EXT';

function App() {
  const [fetchQueueState, setFetchQueueState] = useState<boolean>(false);
  const [dataToFetch, setDataToFetch] = useState<ApiRivalConfigResponseI>();
  const [dataCounter, setDataCounter] = useState<number>(0);
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
    for (const elem of data.list) {
      const data = await getProductInfo(elem.product.sku, elem.product.sku);
      if (data.statusCode > 399) alert(data.error);

      await axios.request({
        url: `${API_URL}/update`, method: "post", data: {
          data: data,
          id: elem.id,
          sellerId: selectedSellerState.id,
          hash: appState.activationCode
        }
      })
      setDataCounter((prev) => prev + 1);
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(0)
        }, 200)
      })
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
    {
      fetchQueueState && <div>
        <div className='info'>Идёт интеграция; Пожалуйста ждите-)</div>
        {dataToFetch?.total! > 0 && <div>
          <div>Всего {dataToFetch?.total} товаров будет обновлено))</div>
          <div style={{'color': 'green'}}>Уже обновлено {dataCounter}</div>
        </div>}
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

const KaspiPercents: PercentDataApi = {
  "percents": [
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Автомобильные визитки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Автомобильные колпаки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Автомобильные маркизы",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Автомобильные органайзеры и сумки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Автомобильные пепельницы",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Автомобильные подушки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Автомобильные шторки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Автопалатки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Газовые упоры капота и багажника",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Защитные тенты-чехлы",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Коврики для автомобиля",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Наборы автомобилиста",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Накидки на панель приборов автомобиля",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Оплетки и чехлы на руль",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Подлокотники",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Ручки КПП для автомобиля",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Секретные болты и гайки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Ступичные проставки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Чехлы для салона",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоаксессуары",
      "3": "Щетки стеклоочистителей",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоакустика",
      "3": "FM-трансмиттеры",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоакустика",
      "3": "Автомагнитолы",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоакустика",
      "3": "Автомобильные усилители",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоакустика",
      "3": "Аксессуары для автомобильной аудиотехники",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоакустика",
      "3": "Акустические короба и подиумы для автомобилей",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автоакустика",
      "3": "Колонки и сабвуферы",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоакустика",
      "3": "Переходные рамки для автомагнитол",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Автомобильные двери",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Автомобильные подушки безопасности",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Автомобильные рули",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Автомобильные сигналы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Автомобильные фильтры",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Автостекла",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Амортизаторы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Бамперы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Бачки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Выхлопная система",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Генераторы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Датчики давления в шинах",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Датчики кислорода",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Датчики массового расхода воздуха",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Двигатели",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Капоты и крышки багажника для автомобилей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Катушки зажигания",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Компрессоры кондиционера",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Крылья автомобилей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Наружные зеркала заднего вида",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Насосы водяного охлаждения",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Панели кузова",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Подкрылки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Подрулевые шлейфы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Прочие детали кузова",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Радиаторы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Ремни и цепи ГРМ",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Рулевые рейки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Салонные зеркала заднего вида для автомобилей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Свечи зажигания",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Свечные провода",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Стартеры",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Стеклоподъемники",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Топливные насосы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Тормозные диски",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Тормозные колодки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Тормозные шланги",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Трансмиссия и ходовая часть",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Турбонагнетатели",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автозапчасти",
      "3": "Элементы двигателя",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автоинструменты",
      "3": "Оправки и съемники для поршневых колец",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автоинструменты",
      "3": "Инструменты для ремонта автостекол",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомалярные работы",
      "3": "Грунты для кузовного ремонта автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автомалярные работы",
      "3": "Краски для кузовного ремонта автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автомалярные работы",
      "3": "Лаки для кузовного ремонта автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автомалярные работы",
      "3": "Шпатлевки для кузовного ремонта автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильная электрика",
      "3": "Автомобильные реле",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектрика",
      "3": "Нагревательные элементы",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Автокомпрессоры",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Автомобильные домкраты и подставки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Автомобильные лебедки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Автопылесосы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Автохолодильники",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Аксессуары для фаркопов",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Буксировочные тросы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Зарядные и пуско-зарядные устройства для аккумуляторов",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Нагрузочные вилки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Обогреватели двигателя и салона автомобиля",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Пусковые провода",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Системы контроля давления в шинах",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Топливные канистры",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Утеплители для автомобиля",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Фаркопы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное оборудование",
      "3": "Цепи противоскольжения для автомобилей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное освещение",
      "3": "Автолампы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное освещение",
      "3": "Блоки розжига",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное освещение",
      "3": "Дополнительный автосвет",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильное освещение",
      "3": "Фары и линзы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильные противоугонные устройства",
      "3": "Аксессуары для противоугонных устройств",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автомобильные противоугонные устройства",
      "3": "Брелоки и чехлы для автосигнализаций",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Автоподъемники",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Аксессуары для автосервисного оборудования",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Балансировочные станки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Бустеры для подкачки шин",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Ванны для проверки автомобильных шин и камер",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Вулканизаторы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Заправочные станции для автокондиционеров",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Маслораздаточные установки и нагнетатели смазки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Мебель для автосервиса",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Насосы для перекачки технических жидкостей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Пресс-станки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Приборы для регулировки и проверки света фар",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Стенды для правки дисков",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Cтенды для проточки тормозных дисков",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Стенды развал-схождения",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Стенды для тестирования и промывки форсунок",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Топливораздаточное оборудование",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Трансмиссионные стойки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Установки для мойки деталей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Установки для очистки системы охлаждения и замены охлаждающей жидкости",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Установки для сбора масла и технических жидкостей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автосервисное оборудование",
      "3": "Шиномонтажные станки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Автомобильные антикоры",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Автошампуни и пены для мойки",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Ароматизаторы салона автомобиля",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Антидождь для автостекол",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Воски для автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Жидкость для стеклоомывателя",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Клеи и герметики для автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Наборы для полировки",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Наборы и герметики для ремонта шин автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Очистители для салона автомобиля",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Очистители и полироли для шин и дисков автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Полироль для кузова автомобиля",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Полироль для салона автомобиля",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Принадлежности для мойки автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автохимия и автокосметика",
      "3": "Технические очистители для автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектрика",
      "3": "Замки зажигания",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "GPS навигаторы",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "GPS-трекеры",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "HUD проекторы",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Автомобильные антенны",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Автомобильные бортовые компьютеры",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Автомобильные видеоинтерфейсы и навигационные блоки",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Автомобильные телевизоры и мониторы",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Автомобильные устройства громкой связи",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Автосигнализации",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Автосканеры",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектрика",
      "3": "Автомобильные предохранители",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектрика",
      "3": "Клеммы для автомобильных аккумуляторов",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Видеорегистраторы",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Круиз-контроль",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Парковочные камеры",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Парктроники",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Радар-детекторы",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Автоэлектроника",
      "3": "Разветвители прикуривателя",
      "percent": "5%"
    },
    {
      "1": "Автотовары",
      "2": "Аксессуары для багажных систем",
      "3": "Подножки и лестницы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Аксессуары для багажных систем",
      "3": "Системы хранения",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Аккумуляторы",
      "3": "Аккумуляторы",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Багажные системы",
      "3": "Багажники для лыж и сноубордов",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Багажные системы",
      "3": "Багажные боксы",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Багажные системы",
      "3": "Багажные корзины",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Багажные системы",
      "3": "Крепления для велосипедов",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Багажные системы",
      "3": "Рейлинги и поперечины",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Багажные системы",
      "3": "Стяжки для крепления груза",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Багажные системы",
      "3": "Фейринги",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "ГБО",
      "3": "Комплектующие ГБО",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "ГБО",
      "3": "Комплекты ГБО",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Детали салона",
      "3": "Приборные панели автомобилей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Детали салона",
      "3": "Салонные кнопки и переключатели",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Автомобильные дефлекторы и спойлеры",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Брызговики",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Декоративные и защитные пленки для автомобилей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Защита бамперов и порогов",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Защита картера и КПП",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Защитные накладки",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Рамки для автомобильных номеров",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Шноркели для внедорожников",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Шумоизоляция для автомобилей",
      "percent": "8%"
    },
    {
      "1": "Автотовары",
      "2": "Коврики для автомобиля и аксессуары",
      "3": "Аксессуары для автомобильных ковриков",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Комплекты дисков",
      "3": "Комплекты дисков",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Защита и внешний тюнинг",
      "3": "Комплекты обвесов",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Масла и технические жидкости",
      "3": "Антифризы",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Масла и технические жидкости",
      "3": "Гидравлические жидкости и масла",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Масла и технические жидкости",
      "3": "Моторные масла",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Масла и технические жидкости",
      "3": "Присадки и промывки для автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Масла и технические жидкости",
      "3": "Смазки для автомобилей",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Масла и технические жидкости",
      "3": "Тормозные жидкости",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Масла и технические жидкости",
      "3": "Трансмиссионные масла",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотозащита",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотокомбинезоны",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотокофры",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотокуртки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотообувь",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотоочки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотоперчатки",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Моторубашки и мотокофты",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотошлемы",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Мотоштаны",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Мотоэкипировка",
      "3": "Переговорные устройства для мотоциклистов",
      "percent": "10%"
    },
    {
      "1": "Автотовары",
      "2": "Спецтехника",
      "3": "Комплектующие и аксессуары",
      "percent": "7%"
    },
    {
      "1": "Автотовары",
      "2": "Спецтехника и мототехника",
      "3": "Автоприцепы",
      "percent": "7%"
    },
    {
      "1": "Автотовары",
      "2": "Спецтехника и мототехника",
      "3": "Квадроциклы",
      "percent": "7%"
    },
    {
      "1": "Автотовары",
      "2": "Спецтехника и мототехника",
      "3": "Мотокамеры",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Спецтехника и мототехника",
      "3": "Мотоциклы",
      "percent": "7%"
    },
    {
      "1": "Автотовары",
      "2": "Спецтехника и мототехника",
      "3": "Скутеры и мопеды",
      "percent": "7%"
    },
    {
      "1": "Автотовары",
      "2": "Спецтехника и мототехника",
      "3": "Мотозапчасти",
      "percent": "7%"
    },
    {
      "1": "Автотовары",
      "2": "Спецтехника и мототехника",
      "3": "Снегоходы",
      "percent": "7%"
    },
    {
      "1": "Автотовары",
      "2": "Шины",
      "3": "Мотошины",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Шины",
      "3": "Шины для внедорожников",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Шины",
      "3": "Шины для грузового транспорта",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Шины",
      "3": "Шины для коммерческого транспорта",
      "percent": "6%"
    },
    {
      "1": "Автотовары",
      "2": "Шины",
      "3": "Шины для легковых и внедорожных автомобилей",
      "percent": "6%"
    },
    {
      "1": "Аксессуары",
      "2": "Аксессуары для одежды и обуви",
      "3": "Джиббитсы",
      "percent": "11%"
    },
    {
      "1": "Аптека",
      "2": "Аптека",
      "3": "Энтеральное питание",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Витамины и БАД",
      "3": "Витамины и БАД",
      "percent": "10%"
    },
    {
      "1": "Аптека",
      "2": "Гигиена",
      "3": "Блокаторы вирусов",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Гигиена",
      "3": "Средства по уходу за больными",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Аксессуары для глюкометров и анализаторов крови",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Аксессуары для кислородного оборудования",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Антисептики для рук",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Антисептическое мыло",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Бахилы медицинские",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Ватные палочки и диски",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Вертикализаторы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Гели проводники",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Гигиенические вкладыши для одежды",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Гигиенические прокладки и тампоны",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Гинекологические тесты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Грелки и электрогрелки",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Дезинфекционные туннели",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Дезинфицирующие коврики",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Дезинфицирующие салфетки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Дерматоскопы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Защитные маски",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Защитные экраны для лица",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Кало и мочеприемники",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Кресла-коляски",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Кровати функциональные",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Лубриканты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Медицинские аптечки",
      "percent": "8%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Медицинские динамометры",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Медицинские контейнеры",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Медицинские перчатки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Неврологические инструменты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Опоры и ходунки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Отоскопы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Пандусы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Пеленки и простыни",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Перевязочные материалы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Подгузники для взрослых",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Презервативы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Прогулочные опоры",
      "percent": "10%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Прокладки для груди",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Прокладки урологические",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Противопролежневые матрасы и подушки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Рентгенпленки и материалы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Санитарные кресла",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Спринцовки и клизмы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Средства для обработки поверхностей",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Стетоскопы",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Термоконтейнеры медицинские",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Трости и костыли",
      "percent": "10%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Шапочки медицинские",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Шприцы, иглы и инъекторы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Изделия медицинского назначения",
      "3": "Экспресс-тесты на антиген к SARS-CoV-2 (COVID-19)",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лабораторное оборудование",
      "3": "Лабораторные анализаторы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лабораторное оборудование",
      "3": "Центрифуга лабораторная",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Акушерство и гинекология",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Аллергия",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Болеутоляющие препараты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Воспаление и инфекции",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Вредные привычки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Дезинфицирующие средства",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Желудок, кишечник, печень",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Зрение",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Кожа, волосы, ногти",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Лечебные кремы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Мочеполовая система",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Мышцы, кости и суставы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Неврология",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Повышение иммунитета",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Полость рта",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Простуда, грипп",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Противомикробные препараты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Сердечно-сосудистые",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Ухо, горло, нос",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Фиточаи и травяные сборы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лекарства и травы",
      "3": "Эндокринология",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Лечебное питание и травы",
      "3": "Активаторы воды",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Личная гигиена",
      "3": "Инструменты для вычесывания вшей",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Массажеры и аппликаторы",
      "3": "Биоэнергомассажеры и материалы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Массажные приборы",
      "3": "Массажные банки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Маски, бинты, шприцы",
      "3": "Аптечки и таблетницы",
      "percent": "8%"
    },
    {
      "1": "Аптека",
      "2": "Мебель медицинская",
      "3": "Гинекологические кушетки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Мебель медицинская",
      "3": "Медицинские светильники и расходные материалы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Мебель медицинская",
      "3": "Столы и тележки медицинские",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Мебель медицинская",
      "3": "Штатив медицинский",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медицинские инструменты",
      "3": "Одноразовые медицинские инструменты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медицинские инструменты",
      "3": "Хирургические инструменты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медицинские инструменты",
      "3": "Эндоскопы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медицинские приборы",
      "3": "Аксессуары для физиотерапевтических аппаратов",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медицинские приборы",
      "3": "Диагностическое оборудование",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медицинские приборы",
      "3": "Нейростимуляторы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медицинские приборы",
      "3": "Расходные материалы для слуховых аппаратов",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Аксессуары для слуховых аппаратов",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Алкотестеры",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Аппараты магнитотерапии",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Аспираторы для малышей",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Голосообразующие аппараты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Дефибрилляторы",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Инсулиновые помпы и аксессуары",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Кварцевые лампы и облучатели",
      "percent": "10%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Кислородные баллоны",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Концентраторы кислорода",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Манжеты для массажеров",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Манжеты и аксессуары для тонометров",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Маски и очки для новорожденных",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Массажные коврики и подушки",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Массажные кровати",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Медицинские глюкометры и анализаторы крови",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Медицинские термометры",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Небулайзеры",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Нитратомеры и экотестеры",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Осветители и рефлекторы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Пульсоксиметры",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Ростомеры",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Слуховые аппараты",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Тонометры",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Устройства от насморка и аллергии",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Физиотерапевтические аппараты",
      "percent": "5%"
    },
    {
      "1": "Аптека",
      "2": "Медтехника",
      "3": "Хирургические отсасыватели",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Оптика",
      "3": "Аксессуары для оптики",
      "percent": "11%"
    },
    {
      "1": "Аптека",
      "2": "Оптика",
      "3": "Контактные линзы",
      "percent": "11%"
    },
    {
      "1": "Аптека",
      "2": "Оптика",
      "3": "Линзы для очков",
      "percent": "11%"
    },
    {
      "1": "Аптека",
      "2": "Оптика",
      "3": "Оборудование для оптики",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Оптика",
      "3": "Оправы для очков",
      "percent": "11%"
    },
    {
      "1": "Аптека",
      "2": "Оптика",
      "3": "Очки для зрения",
      "percent": "11%"
    },
    {
      "1": "Аптека",
      "2": "Оптика",
      "3": "Растворы для линз",
      "percent": "11%"
    },
    {
      "1": "Аптека",
      "2": "Ортопедия",
      "3": "Бандажи и ортезы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Ортопедия",
      "3": "Брейсы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Ортопедия",
      "3": "Компрессионный трикотаж",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Ортопедия",
      "3": "Корректоры для ног и стопы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Ортопедия",
      "3": "Ортопедические корсеты и корректоры осанки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Ортопедия",
      "3": "Ортопедическая обувь",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Ортопедия",
      "3": "Ортопедические стельки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Ортопедия",
      "3": "Ушные корректоры",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Офтальмология",
      "3": "Оправы пробные",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Офтальмология",
      "3": "Офтальмоскопы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Офтальмология",
      "3": "Пробные очковые линзы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Офтальмология",
      "3": "Скиаскопы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Офтальмология",
      "3": "Тонометры глазного давления",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Реабилитация",
      "3": "Аксессуары для реабилитационных товаров",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Реабилитация",
      "3": "Мобильные вертикализаторы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Реабилитация",
      "3": "Подушки для позиционирования",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Реабилитация",
      "3": "Реабилитационные тренажеры",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Реабилитация",
      "3": "Экзопротезы молочной железы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Брекеты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Дентальные рентген аппараты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Зеркала и ручки стоматологические",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Зубные импланты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Зуботехническое инструменты и материалы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Инструменты для реставрации",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Капы стоматологические",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Компрессоры стоматологические",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Контейнеры для хранения",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Материалы для пломбирования",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Наконечники и микромоторы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Полимеризационные лампы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Радиовизиографы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Стерилизаторы медицинские",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Стоматологические 3D принтеры",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Стоматологические стулья",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Стоматологические установки",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Стоматологические фотополимеры для 3D печати",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Физиодиспенсеры и Пьезохирургия",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматология",
      "3": "Эндомоторы и апекслокаторы",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Стоматологические инструменты и материалы",
      "3": "Эндодонтические инструменты",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Специальное оборудование",
      "3": "Лабораторная посуда",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Уход за больными",
      "3": "Гипс и шины",
      "percent": "7%"
    },
    {
      "1": "Аптека",
      "2": "Уход за больными",
      "3": "Надувные ванны для ухода за больными",
      "percent": "7%"
    },
    {
      "1": "Бытовая техника",
      "2": "Аксессуары для климатической техники",
      "3": "Аксессуары для водонагревателей",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Аксессуары для крупной бытовой техники",
      "3": "Аксессуары для духовых шкафов",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Аксессуары для крупной бытовой техники",
      "3": "Аксессуары для кухонных плит",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Аксессуары для крупной бытовой техники",
      "3": "Аксессуары для посудомоечных машин",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Аксессуары для кондиционеров",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Аксессуары для увлажнителей, очистителей и осушителей",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Барометры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Вентиляторы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Водонагреватели",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Кондиционеры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Обогреватели",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Озонаторы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Осушители воздуха",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Отопительные котлы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Очистители и увлажнители",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Рекуператоры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Климатическая техника",
      "3": "Цифровые метеостанции и термометры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Комплектующие для климатической техники",
      "3": "Комплектующие для отопительных котлов",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Кофемашины и кофеварки",
      "3": "Кофе-принтеры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Аксессуары для кулеров и пурифайеров",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Аксессуары для стиральных и сушильных машин",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Аксессуары для холодильников",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Варочные поверхности",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Вытяжки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Духовые шкафы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Кулеры для воды",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Кухонные плиты",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Морозильники",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Паровые шкафы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Посудомоечные машины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Стиральные машины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Сушильные машины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Крупная техника для дома",
      "3": "Холодильники",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Аксессуары для отпаривателей и пароочистителей",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Аксессуары для пылесосов",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Аксессуары для утюгов",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Аксессуары для швейных машин",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Вышивальные машины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Вязальные машины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Гладильные прессы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Гладильные системы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Оверлоки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Отпариватели",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Парогенераторы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Пароочистители",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Пылесосы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Роботы-пылесосы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Ультразвуковые устройства для стирки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Утюги",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Швейные машины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Электрические стеклоочистители",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Малая техника для дома",
      "3": "Электровеники и электрошвабры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Аппараты для сушки и полировки бокалов",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Лампы для подогрева блюд",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Макароноварки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Морозильные столы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Пароконвектоматы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Пивоварни",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Пилы ленточные пищевые",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Пищеварочные котлы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Подогреватели посуды",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Стерилизаторы бытовые",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Тестораскаточные машины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Ультразвуковые очистители",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Фризеры для мороженного",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Холодильные витрины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Холодильные столы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Электрокипятильники погружные",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Электроказаны",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Электрические картофелечистки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Прочая кухонная техника",
      "3": "Электрические ланч-боксы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Автоклавы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Аксессуары для кухонной техники",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Аппараты для очистки питьевой воды",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Аппараты для приготовления сахарной ваты",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Аппараты для приготовления шаурмы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Безмены",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Блендеры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Блендеры-пароварки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Блинницы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Вакуумные упаковщики",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Вспениватели молока",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Дистилляторы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Жарочные шкафы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Измельчители пищевых отходов",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Йогуртницы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Кофеварки и кофемашины",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Кофемолки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Куттеры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Кухонные весы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Кухонные измельчители",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Кухонные комбайны",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Кухонные таймеры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Ломтерезки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Льдогенераторы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Маслопрессы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Микроволновые печи",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Миксеры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Мороженицы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Мукопросеиватели",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Мультиварки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Мультипекари",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Мясорубки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Настольные плиты",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Настольные электропечи",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Пароварки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Печи для пиццы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Помпы для воды",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Попкорницы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Расстоечные шкафы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Соковыжималки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Сокоохладители",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Су-вид аппараты",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Сушилки для фруктов и овощей",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Сыроварни",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Сэндвичницы и вафельницы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Термощупы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Тестомесы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Тостеры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Фритюрницы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Хлебопечи",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Шоколадные фонтаны",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Электрические мармиты",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Электрические яйцеварки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Электрогрили",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Электросковородки",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для кухни",
      "3": "Электрочайники и термопоты",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Техника для приготовления десертов",
      "3": "Пищевые принтеры",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Торговые автоматы",
      "3": "Кофейные автоматы",
      "percent": "5%"
    },
    {
      "1": "Бытовая техника",
      "2": "Торговые автоматы",
      "3": "Снековые автоматы",
      "percent": "5%"
    },
    {
      "1": "Детские товары",
      "2": "Безопасность ребенка",
      "3": "Аккумуляторы и батареи для видеонянь",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Безопасность ребенка",
      "3": "Генераторы белого шума",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Безопасность ребенка",
      "3": "Защита на прогулке и дома",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Безопасность ребенка",
      "3": "Штативы и держатели для видеонянь",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Безопасность ребенка",
      "3": "Светоотражающие элементы для детей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Детское питание",
      "3": "Детские каши",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Детское питание",
      "3": "Детские соки, вода, компоты, нектары",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Детское питание",
      "3": "Детское печенье, батончики, сухарики",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Детское питание",
      "3": "Детское пюре",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Детское питание",
      "3": "Молочные смеси",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Детские товары",
      "3": "Абонементы для детских развлекательных учреждений",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Аксессуары для детских шезлонгов",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Блокирующие, защитные устройства",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Бутылочки, ниблеры, аксессуары",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Ванночки для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Видеоняни",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Влажные салфетки для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Горки и сиденья для ванн",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Горшки и детские сиденья",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Детские ростомеры",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Круги и козырьки для купания",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Многоразовые подгузники, трусики",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Молокоотсосы",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Наборы в роддом",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Нагрудники и слюнявчики",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Накладки для груди",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Пеленальные столики и доски",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Пеленки для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Подарочные наборы для малышей",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Подгузники",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Подогреватели и стерилизаторы",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Подушки для мам(не использовать)",
      "percent": "8%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Поильники для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Постельное белье для малышей",
      "percent": "8%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Посуда для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Присыпки и кремы под подгузник",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Прорезыватели",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Пустышки и аксессуары",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Радионяни",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Соски для бутылочек",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Средства по уходу за кожей малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Столовые приборы для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Стульчики для кормления и аксессуары",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Сумки для мам",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Термометры для воды и воздуха",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Ходунки",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Для малыша и мамы",
      "3": "Хранение грудного молока и питания",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Аксессуары для детского транспорта",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Аксессуары для кукол",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Детские игровые коврики",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Детские наборы для исследований",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Игрушечное оружие и бластеры",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Игрушечные роботы и трансформеры",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Игрушечный транспорт",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Игрушки для купания",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Игрушки-антистресс",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Игры на свежем воздухе",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Конструкторы",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Куклы",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Мягкие игрушки",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Наборы игрушек",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Радиоуправляемые игрушки",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Развивающие игрушки",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Игрушки",
      "3": "Фигурки персонажей",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Товары для мам",
      "3": "Аксессуары для молокоотсосов",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Аксессуары для автокресел",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Аксессуары для колясок",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Аксессуары для электромобилей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Базы для автокресел",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Беговелы",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Детские автокресла",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Детские велокресла и трейлеры",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Детские игровые домики и палатки",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Детские качели",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Детские песочницы",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Детские электромобили",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "ЖД-манежи",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Игровые комплексы",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Каталки, качалки, прыгуны",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Качели и шезлонги для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Коляски",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Люльки-переноски для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Надувные игрушки",
      "percent": "10%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Надувные комплексы и батуты",
      "percent": "11%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Сухие бассейны",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Трехколесные велосипеды",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Шарики для сухих бассейнов",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Прогулки, поездки, активный отдых",
      "3": "Эргорюкзаки и кенгуру для малышей",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Уход и гигиена малыша",
      "3": "Детские маникюрные инструменты и наборы",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Уход и гигиена малыша",
      "3": "Накопители для подгузников и аксессуары",
      "percent": "7%"
    },
    {
      "1": "Детские товары",
      "2": "Уход и гигиена малыша",
      "3": "Подогреватели влажных салфеток",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Аксессуары для духовых инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Аксессуары для перкуссии",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Аксессуары для смычковых инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Беруши для музыкантов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Блоки питания для музыкальных инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Бриджи, порожки и струнодержатели",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Дирижерские палочки",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Звукосниматели для музыкальных инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Колки для музыкальных инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Медиаторы",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Мембраны для перкуссии",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Педали для барабанной установки",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Переходники для инструментальных кабелей",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Радиосистемы",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Средства по уходу за музыкальными инструментами",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Трости для духовых инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аксессуары для музыкальных инструментов",
      "3": "Фурнитура для гитар",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Аттракционы для помещений",
      "3": "Аттракционы для взрослых",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Амулеты и талисманы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Биолокационные рамки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Карты Таро",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Наборы для создания карты желаний",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Маятники для гаданий",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Метафорические ассоциативные карты",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Мешочки, шкатулки, скатерти для гаданий",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Музыка ветра",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Ритуальные свечи",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Руны",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Гадания и эзотерика",
      "3": "Спиритические доски",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Духовые",
      "3": "Кларнеты",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Досуг, книги",
      "3": "Игры для компаний",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Аксессуары для настольных игр",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Альбомы для хранения карт",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Домино",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Игральные карты",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Игральные кости",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Лото",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Мозаики",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Наборы для покера",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Наборы для фокусов",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Нарды",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Настольные игры",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Пазлы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Протекторы для карт",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Шахматы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Игры для компаний",
      "3": "Шашки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Клавишные",
      "3": "MIDI-клавиатуры",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Клавишные",
      "3": "Баяны",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Аудиокниги",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Бизнес-литература",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Детская литература",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Дом, досуг, хобби",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Журналы и газеты",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Искусство и культура",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Книги медийных личностей",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Комиксы и графическая литература",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Компьютеры и интернет",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Литература на иностранных языках",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Медицина",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Наука и образование",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Психологическая литература",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Религиозная литература",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Словари, энциклопедии",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Учебники и пособия",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Художественная литература",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Цифровые книги, аудиокниги и видеокурсы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Эзотерика",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Книги",
      "3": "Юридическая литература",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Коллекционирование и моделирование",
      "3": "Альбомы для марок",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Коллекционирование и моделирование",
      "3": "Аксессуары для монет",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Коллекционирование и моделирование",
      "3": "Инструменты для чистки монет",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Коллекционирование и моделирование",
      "3": "Инструменты для моделирования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Коллекционирование и моделирование",
      "3": "Средства для чистки монет",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные диски и пластинки",
      "3": "Виниловые пластинки",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные диски и пластинки",
      "3": "Музыкальные диски",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Акустические гитары",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Банджо",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Барабанные палочки",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Виолончели",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Гитарные комбоусилители",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Губные гармошки и мелодики",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Домбры",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Инструментальные кабели",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Казу",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Каподастры",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Мандолины",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Мебель для музыкантов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Метрономы, тюнеры и камертоны",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Педали и процессоры эффектов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Перкуссия",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Пюпитры",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Ремни для гитар",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Саксофоны",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Синтезаторы",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Скрипки",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Стойки для музыкальных инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Струны для гитар",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Струны для смычковых инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Тарелки для ударных инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Трубы",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Ударные инструменты",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Укулеле",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Флейты",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Цифровые пианино",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Чехлы для музыкальных инструментов",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Музыкальные инструменты",
      "3": "Электрогитары",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Мыловарение",
      "3": "Ароматизаторы для мыловарения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Мыловарение",
      "3": "Инструменты для мыловарения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Мыловарение",
      "3": "Красители и масла для мыловарения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Мыловарение",
      "3": "Мыльные основы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Мыловарение",
      "3": "Наборы для мыловарения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Мыловарение",
      "3": "Наполнители для мыловарения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Наполнители для рукоделия",
      "3": "Холлофайбер, синтепух, синтепон",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Оптические приборы",
      "3": "Комплектующие для микроскопов",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Оптические приборы",
      "3": "Микроскопы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Оптические приборы",
      "3": "Монтировки для телескопов",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Оптические приборы",
      "3": "Окуляры для телескопов",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Струнные",
      "3": "Лиры",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для вязания",
      "3": "Аксессуары для вязания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для вязания",
      "3": "Блокаторы для вязания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для вязания",
      "3": "Крючки для вязания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для вязания",
      "3": "Счетчики рядов и петель для вязания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для декупажа",
      "3": "Наборы для декупажа",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для лепки",
      "3": "Средства для глины",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рисования",
      "3": "Аэрографы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рисования",
      "3": "Гипсовые и деревянные фигуры для художников",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рисования",
      "3": "Мастихины для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рисования",
      "3": "Песок для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги10%",
      "2": "Товары для рисования",
      "3": "Световые столы для рисования песком",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рисования",
      "3": "Удлинители и колпачки для карандашей",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рисования",
      "3": "Фартуки и нарукавники для творчества",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рисования",
      "3": "Хна для рисования на теле",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рисования",
      "3": "Чернила для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Аксессуары для эпоксидной смолы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Декор для творчества",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Замки для сумок",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Инструменты для выпиливания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Коврики для резки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Красители для изготовления свечей",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Леска и проволока для бисероплетения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Липучки для рукоделия",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Материалы для плетения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Наборы для валяния",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Наборы для плетения из лозы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Наборы для создания картин из эпоксидной смолы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Наборы для изготовления слаймов",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Органайзеры для рукоделия",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Пинцеты для рукоделия",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Ручки для сумок",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Станки для создания мультфильмов",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Текстильные стропы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Силикон для изготовления и заливки форм",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Фены и термоаппликаторы для рукоделия",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для рукоделия",
      "3": "Фермуары",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для скрапбукинга",
      "3": "Машинки для вырубки и тиснения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для скрапбукинга",
      "3": "Фоамиран и изолон",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Бретели",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Вспомогательные инструменты для шитья",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Выкройки для шитья",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Демонстрационные манекены",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Иглы для рукоделия",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Измерительные приспособления для шитья",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Игольницы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Кружева для шитья",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Мел, маркеры и карандаши для разметки на ткани",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Наборы фурнитуры для ткани",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Нашивки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Пена для объемной вышивки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Подошвы для изготовления обуви",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Прессы для швейной фурнитуры",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Пуговицы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Пяльцы для вышивания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Схемы для вышивания бисером",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Рамки для вышивания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Раскройные столы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Чашечки для бюстгальтера",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Товары для шитья и вышивания",
      "3": "Флизелин и водорастворимые пленки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Ударные",
      "3": "Ударные установки",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Фурнитура для сумок",
      "3": "Застежки и петли для сумок",
      "percent": "7%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "3D ручки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Аквагрим",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Алмазные мозаики",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Альбомы для монет",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Альбомы для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Бисер",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Блестки для декора",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Брадсы, люверсы и кнопки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Бумага, картон, калька для скрапбукинга",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Витражная роспись",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Гипс для лепки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Глина для лепки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Гончарные круги",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Гравюры",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Инструменты для лепки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Канвы для вышивания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Картины из пайеток",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Картины из песка",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Картины из пластилина",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Картины из фольги",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Картины по номерам",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Картриджи для 3D ручек",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Кинетический песок",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Кистемойки для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Кисти для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Красители и наполнители для эпоксидной смолы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Краски для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Лаки для живописи",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Мольберты и доски для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для бисероплетения",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для выжигания и выпиливания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для вышивания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для вязания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для изготовления косметики",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для изготовления свечей",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для квиллинга",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для оригами",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для росписи",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для скрапбукинга",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для создания аппликации",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для создания игрушек",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для создания украшений",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для стринг арта",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы для шитья",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наборы из фоамирана",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Наклейки для творчества",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Нитки для вышивания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Нитки для шитья",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Ножницы портновские и раскройные",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Основы для творчества",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Палитры для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Пастель и мелки для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Пластилин",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Портновские колодки",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Портновские манекены",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Приборы для выжигания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Проклейка и грунт для холстов",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Пряжа для вязания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Пудра для эмбоссинга",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Разбавители и загустители для красок",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Раскраски",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Раскройные ножи для ткани",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Сборные модели",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Световые картины",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Силиконовые молды",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Спицы для вязания",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Стразы и бусины",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Ткани для шитья",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Топсы и чипборды для скрапбукинга",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Трафареты и штампы для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Фломастеры",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Холсты для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Художественные наборы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Цветные карандаши для рисования",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Штампы для скрапбукинга",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Хобби и творчество",
      "3": "Эпоксидная смола",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Шахматы",
      "3": "Демонстрационные шахматные доски",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Шахматы",
      "3": "Напольные шахматные доски",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Шахматы",
      "3": "Напольные шахматные наборы",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Шахматы",
      "3": "Напольные шахматные фигуры",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Шахматы",
      "3": "Шахматные доски",
      "percent": "10%"
    },
    {
      "1": "Досуг, книги",
      "2": "Шахматы",
      "3": "Шахматные фигуры",
      "percent": "10%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Бланки",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Блокноты для флипчартов",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Бумага для заметок",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Бумага для чертежных и копировальных работ",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Дневники для школы",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Ежедневники и блокноты",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Календари",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Книги и журналы учета",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Конверты и пакеты почтовые",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Наборы цветной бумаги и картона",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Офисная бумага",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Плакаты",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Рулоны для кассовых аппаратов и терминалов",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Сменные блоки для тетрадей",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Тетради",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Цветная бумага и фольга",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Цветной и белый картон",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Бумага и бумажная продукция",
      "3": "Этикетки самоклеящиеся, ценники",
      "percent": "5%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Демонстрационные доски",
      "3": "Магнитные планеры",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Демонстрационные доски",
      "3": "Флипчарты и офисные доски",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Аксессуары для досок",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Аксессуары для дырокола",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Школьные принадлежности",
      "3": "Анатомические модели",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Аксессуары для резаков",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Бейджи и держатели",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Булавки офисные",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Визитницы и рекламные подставки",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Географические карты и атласы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Глобусы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Датеры и нумераторы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Держатели для флагов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Диспенсеры для закладок и блоков",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Диспенсеры для клейкой ленты",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Диспенсеры для скрепок",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Дыроколы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Зажимы для бумаг",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Калькуляторы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Канцелярские ножи и лезвия",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Канцелярские ножницы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Канцелярский клей",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Карманы самоклеящиеся",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Кассы символов для наборных печатей и штампов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Клейкая лента",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Кнопки канцелярские",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Корзины для бумаг",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Лотки для бумаг",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Лупы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Механизмы для скоросшивания",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Наборы мелкоофисных принадлежностей",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Настольные наборы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Настольные органайзеры",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Обложки для книг и тетрадей",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Офисные настольные коврики",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Папки",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Подставки для книг",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Разделители листов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Расходные материалы для ламинаторов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Расходные материалы для переплета",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Резаки для бумаги",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Резинки канцелярские",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Скобы для степлера",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Скрепки канцелярские",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Степлеры и антистеплеры",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Увлажнитель для пальцев",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Штампы и печати",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Штемпельная краска",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Офисные принадлежности",
      "3": "Картриджи для калькуляторов с печатью",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Заправка и аксессуары для маркеров",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Карандаши механические",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Карандаши чернографитные",
      "percent": "10%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Корректирующие средства для текста",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Ластики",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Маркеры",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Набор первоклассника",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Наборы письменных принадлежностей",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Пеналы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Расходники для ручек и карандашей",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Ручки",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Письменные принадлежности",
      "3": "Точилки для карандашей",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатное оборудование",
      "3": "Вырубщики визиток",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатное оборудование",
      "3": "Зажимы для рулонов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатное оборудование",
      "3": "Термогибочное оборудование",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатные инструменты",
      "3": "Каймарезы и щипцы для натяжки баннера",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатные инструменты",
      "3": "Люверсы и насадки для пробойников",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатные инструменты",
      "3": "Ракель",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатные инструменты",
      "3": "Оборудование для установки люверсов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатные инструменты",
      "3": "Подставки под рулоны",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатное оборудование",
      "3": "Биговальные машины",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Постпечатное оборудование",
      "3": "Обрезчик углов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Торговые и рекламные принадлежности",
      "3": "Аксессуары для кассовых боксов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Торговые и рекламные принадлежности",
      "3": "Кнопки вызова персонала",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Торговые и рекламные принадлежности",
      "3": "Заготовки для пластиковых карт",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Торговые и рекламные принадлежности",
      "3": "Лототроны, боксы для голосования и пожертвования",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Торговые и рекламные принадлежности",
      "3": "Сумки инкассаторские, мешки для монет",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Торговые и рекламные принадлежности",
      "3": "Счетницы для кафе и ресторанов",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Торговые принадлежности",
      "3": "Рекламное и выставочное оборудование",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Торговые принадлежности",
      "3": "Этикет-пистолеты",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Чертежные принадлежности",
      "3": "Линейки",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Чертежные принадлежности",
      "3": "Наборы чертежные",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Чертежные принадлежности",
      "3": "Транспортиры",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Чертежные принадлежности",
      "3": "Тубусы для чертежей",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Чертежные принадлежности",
      "3": "Циркули и готовальни",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Чертежные принадлежности",
      "3": "Чертежные доски",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Чертежные принадлежности",
      "3": "Шаблоны, трафареты, лекала",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Школьные принадлежности",
      "3": "Счетные материалы",
      "percent": "15%"
    },
    {
      "1": "Канцелярские товары",
      "2": "Штемпельные принадлежности",
      "3": "Оснастки для печатей и штампов",
      "percent": "15%"
    },
    {
      "1": "Компьютеры",
      "2": "Аксессуары для моддинга",
      "3": "Выносные кнопки и индикаторы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Аксессуары для моддинга",
      "3": "Резервуары",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Аксессуары для моддинга",
      "3": "Кабели,переходники и разветвители",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Аксессуары для моддинга",
      "3": "Крепления для накопителей",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Аксессуары для моддинга",
      "3": "Трубки и шланги",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Аксессуары для моддинга",
      "3": "Устройства расширения",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Аксессуары для моддинга",
      "3": "Фитинги для системы водяного охлаждения",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Блоки питания",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Держатели для видеокарт",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Видеокарты",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Жесткие диски и твердотельные накопители",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Звуковые карты",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Корпуса",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Кулеры, системы охлаждения",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Крепления для вентиляторов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Материнские платы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Оперативная память",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Оптические приводы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Процессоры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Решетки и фильтры для вентиляторов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Комплектующие",
      "3": "Термоинтерфейсы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Микрокомпьютеры и аксессуары",
      "3": "Датчики для микрокомпьютеров",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Корпуса для ноутбуков",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Кулеры и системы охлаждения для ноутбуков",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Микрокомпьютеры и аксессуары",
      "3": "Макетные платы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Микрокомпьютеры и аксессуары",
      "3": "Микрокомпьютеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Микрокомпьютеры и аксессуары",
      "3": "Модули для микрокомпьютеров",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Настольные компьютеры",
      "3": "Моноблоки",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Настольные компьютеры",
      "3": "Настольные компьютеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Настольные компьютеры",
      "3": "Неттопы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Аккумуляторы для ноутбуков",
      "percent": "10%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Блоки питания для ноутбуков",
      "percent": "10%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Док-станции для ноутбуков",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Заглушки для разъемов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Замки для ноутбуков",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Защитные накладки для клавиатуры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Клавиатуры для ноутбуков",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Матрицы для ноутбуков",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Ноутбуки",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Петли для ноутбуков",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Подставки для ноутбуков",
      "percent": "10%"
    },
    {
      "1": "Компьютеры",
      "2": "Ноутбуки и аксессуары",
      "3": "Сумки для ноутбуков",
      "percent": "10%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "3D-принтеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "IP-телефоны",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Автоподатчики для принтеров и МФУ",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Аксессуары для 3D-принтеров",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Брошюровщики",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Буклетмейкеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Документ-камеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Емкости для отработанных чернил",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Картриджи",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Компактные фотопринтеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Ламинаторы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Мини-принтеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Масла и смазки для оргтехники",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Перезаправляемые картриджи",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Печатающие головки",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Пластик для 3D-печати",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Принтеры для печати пластиковых карт",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Принтеры и МФУ",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Проводные телефоны",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Программаторы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Режущие плоттеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Системы записи телефонных разговоров",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Системы непрерывной подачи чернил",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Сканеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Термопрессы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Тонеры для принтера",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Трафаретные станки",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Уничтожители документов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Факсы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Запчасти и комплектующие для принтеров",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Форматтеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Фотобарабаны",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Фотополимерные смолы для 3D-печати",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Фьюзерные модули",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Оргтехника и расходные материалы",
      "3": "Чернила для принтера",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "USB Flash карты",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Аккумуляторы для ИБП",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Аппаратные кошельки",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Блоки питания для мониторов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Веб-камеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Внешние боксы для накопителей",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Графические планшеты",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Держатели для провода мыши",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Держатели для проводов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Док-станции для накопителей",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "ИБП, стабилизаторы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Картридеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Карты видеозахвата",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Карты памяти",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Кейкапы для клавиатур",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Клавиатуры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Коврики для мыши",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Компьютерные кабели и переходники",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Крепления для мониторов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Крепления для системных блоков",
      "percent": "8%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Мониторы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Мыши",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Накопители",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Оптические носители",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Панели для мыши",
      "percent": "8%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Перчатки для графических планшетов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Переключатели для клавиатур",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Подставки под запястье",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Подставки для мониторов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Сканеры отпечатков пальцев",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Светильники для устройств",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Сумки и чехлы для мыши",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Футляры для дисков",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Периферия",
      "3": "Электронные переводчики",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Программное обеспечение",
      "3": "Операционные системы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Планшеты и аксессуары",
      "3": "Держатели для планшетов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Планшеты и аксессуары",
      "3": "Планшеты",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Планшеты и аксессуары",
      "3": "Стилусы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Планшеты и аксессуары",
      "3": "Чехлы для планшетов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Bluetooth адаптеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Беспроводное оборудование",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Коммутаторы и маршрутизаторы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Медиаконвертеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Межсетевые экраны",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Межсетевые шлюзы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Патч-панели",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Преобразователи интерфейсов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Серверные блоки питания",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Серверные шкафы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Серверы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Сетевые карты",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Сетевые хранилища",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Спутниковый интернет",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Трансиверы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Усилители интернет-сигнала",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Сетевое оборудование",
      "3": "Усилители сотового сигнала",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "POS-системы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Аксессуары для торговых весов",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Аксессуары для сканеров штрих-кода",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Детекторы банкнот",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Дисплеи покупателей",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Кассовые аппараты",
      "percent": "8%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Принтеры чеков и этикеток",
      "percent": "8%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Программируемые клавиатуры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Сканеры штрих-кода",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Счетчики банкнот",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Счетчики монет",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Счетчики посетителей",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Терминалы сбора данных",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "Электронное оборудование для торговли",
      "3": "Торговые весы",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "IP-телефония и конференц-оборудование",
      "3": "Аналоговые телефонные адаптеры",
      "percent": "5%"
    },
    {
      "1": "Компьютеры",
      "2": "IP-телефония и конференц-оборудование",
      "3": "Автоматические телефонные станции",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Блески для губ",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Декоративные наклейки",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Детская косметика",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Кисти, спонжи и аппликаторы для макияжа",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Контур для глаз",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Контур для губ",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Корректоры и консилеры",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Косметика для бровей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Депиляция и эпиляция",
      "3": "Наборы для депиляции воском",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Наборы косметики",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Органайзеры для косметики",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Основы и фиксаторы для макияжа",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Палетки помад для губ",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Помады",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Пудры",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Румяна и бронзеры",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Тени для век",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Тени и наборы для бровей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Тональные средства",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Точилки для косметических карандашей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Тушь",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Декоративная косметика",
      "3": "Хайлайтеры и скульптурирующие средства",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Депиляция и эпиляция",
      "3": "Бритвы и лезвия",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Депиляция и эпиляция",
      "3": "Воскоплавы и парафиновые ванны",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Депиляция и эпиляция",
      "3": "Паста для шугаринга",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Депиляция и эпиляция",
      "3": "Средства для восковой эпиляции",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Депиляция и эпиляция",
      "3": "Средства для депиляции и эпиляции",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Дизайн ногтей",
      "3": "Аэрография",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Для маникюра и педикюра",
      "3": "Дезинфекция",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Для маникюра и педикюра",
      "3": "Декор",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Для маникюра и педикюра",
      "3": "Гели для дизайна",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Для маникюра и педикюра",
      "3": "Кератолики и кутиклеры",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Для маникюра и педикюра",
      "3": "Масла, сыворотки для ногтей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Для маникюра и педикюра",
      "3": "Насадки для аппаратного маникюра",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты и аксессуары",
      "3": "Атомайзеры",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты и аксессуары",
      "3": "Инструменты и аксессуары для макияжа и ухода за кожей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты и аксессуары",
      "3": "Маски для сна",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты и аксессуары",
      "3": "Органайзеры, косметички и несессеры",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты и аксессуары",
      "3": "Пинцеты косметические",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты для маникюра и педикюра",
      "3": "Аксессуары для мастера",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты для маникюра и педикюра",
      "3": "Кисти для маникюра, щетки",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты для маникюра и педикюра",
      "3": "Товары для ортониксии",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Инструменты для укладки, ухода и наращивания волос",
      "3": "Инструменты и материалы для наращивания волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Кисти, спонжи, точилки",
      "3": "Кисти и аппликаторы",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Кисти, спонжи, точилки",
      "3": "Спонжи и пуховки",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Косметика и аксессуары для бровей и ресниц",
      "3": "Товары для окрашивания",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Косметика и аксессуары для бровей и ресниц",
      "3": "Инструменты и аксессуары",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Массажеры",
      "3": "Аксессуары для массажеров",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Массажеры",
      "3": "Вибромассажеры",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Массажеры",
      "3": "Гидромассажеры",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Массажеры",
      "3": "Мезороллеры",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Массажеры, массажные кресла, миостимуляторы",
      "3": "Массажные приборы, акупунктурные массажеры",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Массажеры, массажные кресла, миостимуляторы",
      "3": "Механические массажеры, роллеры, скребки",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Инструменты для пирсинга",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Источники питания для тату машинок",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Кератин для наращивания волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Манекены тренировочные",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Массажные кресла",
      "percent": "8%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Массажные столы",
      "percent": "8%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Мебель для салонов красоты",
      "percent": "8%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Наращивание ресниц",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Ножницы парикмахерские",
      "percent": "10%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Оборудование для аппаратной косметологии",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Парикмахерские принадлежности",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Пигменты для перманентного макияжа",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Расходные материалы для наращивания волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Расходные материалы для перманентного макияжа",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Расходные материалы для тату",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Средства для ухода за ресницами и бровями",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Столики инструментальные",
      "percent": "8%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Сушуары и климазоны",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Тату-машинки",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Оборудование для салонов красоты",
      "3": "Щипцы для наращивания волос",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Парфюмерия",
      "3": "Парфюмерия",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Система наращивания",
      "3": "Аксессуары для наращивания",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Система наращивания",
      "3": "Акриловые пудры, гели для наращивания и моделирования",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Система наращивания",
      "3": "Типсы и формы для наращивания",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Аппараты для электроэпиляции",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Бритвенные головки и сетки",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Машинки для стрижки волос",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Напольные весы",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Приборы для очищения лица",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Приборы для ухода за телом",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Товары для укладки волос",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Электробигуди",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Электробритвы",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника для красоты",
      "3": "Эпиляторы",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника и оборудование для красоты",
      "3": "Насадки и аксессуары к машинкам для стрижки",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника и оборудование для красоты",
      "3": "Насадки для фена",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника и оборудование для красоты",
      "3": "Холодильники для косметики",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Техника и оборудование для красоты",
      "3": "Фены",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Товары для здоровья",
      "3": "Миостимуляторы",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Товары для здоровья",
      "3": "Пояса и трикотаж для похудения",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Товары для стемпинга",
      "3": "Аксессуары для стемпинга",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Товары для стемпинга",
      "3": "Лаки, краски для стемпинга",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Товары для стемпинга",
      "3": "Наборы для стемпинга",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Бальзамы и кондиционеры для волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Бигуди",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Краска для волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Лаки и спреи для укладки",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Маски для волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Муссы и пенки для укладки",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Наборы по уходу за волосами",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Окислители для краски",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Оттеночные средства для волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Парики и шиньоны",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Расчески и щетки для волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Скрабы и пилинги для кожи головы",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Составы для выпрямления и восстановления волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Средства по уходу за волосами",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Сухие шампуни для волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Уход за бородой и усами",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за волосами",
      "3": "Шампуни для волос",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Аксессуары для ухода за кожей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Кремы и сыворотки",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Лосьоны",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Маски для лица",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Масла и эфирные масла",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Мужские средства для бритья",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Наборы по уходу за кожей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Патчи",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Салфетки матирующие и для снятия макияжа",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Скрабы и пилинги",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Средства для очищения и снятия макияжа",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Средства для снятия макияжа",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за лицом",
      "3": "Средства для ухода за кожей губ",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Аппараты для маникюра и педикюра",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "База и верхнее покрытие для ногтей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Гель-лаки для ногтей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Дизайн ногтей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Жидкости для нанесения и снятия покрытия",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Инструменты для маникюра и педикюра",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Лаки для ногтей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Лампы для сушки ногтей",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Маникюрные пылесосы",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Наборы по уходу за ногтями",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Расходные материалы для маникюра и педикюра",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Система наращивания",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Средства для снятия лака",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Стерилизаторы маникюрных инструментов",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за ногтями",
      "3": "Товары для стемпинга",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за полостью рта",
      "3": "Зубные пасты",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за полостью рта",
      "3": "Зубные щетки",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за полостью рта",
      "3": "Ирригаторы",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за полостью рта",
      "3": "Насадки для электрических зубных щеток и ирригаторов",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за полостью рта",
      "3": "Ополаскиватели для полости рта",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за полостью рта",
      "3": "Отбеливание зубов",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за полостью рта",
      "3": "Стерилизаторы для зубных щеток",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за полостью рта",
      "3": "Электрические зубные щетки",
      "percent": "5%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за телом",
      "3": "Дезодоранты",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за телом",
      "3": "Кремы для тела",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за телом",
      "3": "Парафин косметический",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за телом",
      "3": "Пена, соль, бомбочки для ванны",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за телом",
      "3": "Скрабы и пилинги для тела",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за телом",
      "3": "Средства для душа",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за телом",
      "3": "Средства против целлюлита и растяжек",
      "percent": "7%"
    },
    {
      "1": "Красота и здоровье",
      "2": "Уход за телом",
      "3": "Щетки для массажа, мочалки",
      "percent": "7%"
    },
    {
      "1": "Мебель",
      "2": "Ванная комната",
      "3": "Комплекты для ванной",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Ванная комната",
      "3": "Крючки и вешалки настенные",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Ванная комната",
      "3": "Тумбы под раковину",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Ванная комната",
      "3": "Столешницы для ванной",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Ванная комната",
      "3": "Шкафы в ванную",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "Горки и стенки для гостиной",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "Гостиные гарнитуры",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "Диваны",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "Комплекты для гостиной",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "Комплекты мягкой мебели",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "Надувная мебель",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "Пуфы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "ТВ-тумбы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Гостиная",
      "3": "Шкафы-витрины",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Балдахины и опоры для кроваток",
      "percent": "7%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Детские комоды",
      "percent": "7%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Детские кресла и диваны",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Детские матрасы",
      "percent": "7%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Детские парты",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Детские пуфы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Детские стулья и табуреты",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Комплекты в детскую комнату",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Кроватки",
      "percent": "7%"
    },
    {
      "1": "Мебель",
      "2": "Детская комната",
      "3": "Маятники для детских кроваток",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кресла и стулья",
      "3": "Компьютерные кресла",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кресла и стулья",
      "3": "Кресла",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кресла и стулья",
      "3": "Кресла-мешки",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кресла и стулья",
      "3": "Наполнители для кресел-мешков",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кресла и стулья",
      "3": "Стулья",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кухня",
      "3": "Барные столы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кухня",
      "3": "Ванны моечные",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кухня",
      "3": "Кухонные гарнитуры",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кухня",
      "3": "Кухонные фартуки",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кухня",
      "3": "Кухонные столешницы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кухня",
      "3": "Кухонные уголки",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кухня",
      "3": "Кухонные шкафы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Кухня",
      "3": "Сервировочные столы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Мебель",
      "3": "Трибуны классические",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Офис",
      "3": "Комплекты офисной мебели",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Офис",
      "3": "Офисные тумбы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Офис",
      "3": "Ресепшены",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Офис",
      "3": "Стеллажи",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Офис",
      "3": "Этажерки",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Офис и кабинет",
      "3": "Подставки под ноги",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Прихожая",
      "3": "Вешалки в прихожую",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Прихожая",
      "3": "Комплекты для прихожей",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Прихожая",
      "3": "Тумбы для обуви",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Прихожая",
      "3": "Универсальные системы хранения",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Прихожая",
      "3": "Шкафы в прихожую",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Прихожая",
      "3": "Этажерки обувные",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Комоды",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Кровати",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Матрасы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Основания для матрасов и ламели",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Полки навесные",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Спальные гарнитуры",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Туалетные столики",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Тумбы прикроватные",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Спальня",
      "3": "Шкафы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Столы",
      "3": "Журнальные столики",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Столы",
      "3": "Компьютерные столы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Столы",
      "3": "Консольные столы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Столы",
      "3": "Обеденные группы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Столы",
      "3": "Обеденные столы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Столы",
      "3": "Письменные столы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Столы",
      "3": "Разделочные столы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Аксессуары для экономпанелей",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Вешала торговые",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Кассовые боксы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Линия раздачи для общепитов и элементы",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Паллеты, Поддоны",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Примерочные кабины",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Скамейки для учреждений",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Стойки перфорированные",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Торговые корзины",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Шкафы металлические",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Торговое оборудование",
      "3": "Экономпанели",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Фурнитура и комплектующие для мебели",
      "3": "Комплектующие для мебели",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Фурнитура и комплектующие для мебели",
      "3": "Комплектующие для модульной кухни",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Фурнитура и комплектующие для мебели",
      "3": "Материалы для плетения мебели",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Фурнитура и комплектующие для мебели",
      "3": "Трансформируемые основания электронные и механические",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Фурнитура и комплектующие для мебели",
      "3": "Фурнитура для мебели",
      "percent": "8%"
    },
    {
      "1": "Мебель",
      "2": "Фурнитура и комплектующие для мебели",
      "3": "Защитные бортики",
      "percent": "8%"
    },
    {
      "1": "Обувь",
      "2": "Детская обувь",
      "3": "Детская обувь",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женская домашняя обувь",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женская спортивная обувь",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женская танцевальная обувь",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женская треккинговая обувь",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские балетки",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские ботильоны",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские ботинки и полуботинки",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские кроссовки и кеды",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские мокасины и топсайдеры",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские мюли и сабо",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские сандалии и босоножки",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские сапоги",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские слипоны и эспадрильи",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские туфли",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Женские шлепанцы",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Женская обувь",
      "3": "Спецобувь для женщин",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужская домашняя обувь",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужская спортивная обувь",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужская треккинговая обувь",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужские ботинки",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужские кроссовки и кеды",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужские мокасины и топсайдеры",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужские сандалии",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужские сапоги",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужские слипоны и эспадрильи",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужские туфли",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Мужские шлепанцы",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Мужская обувь",
      "3": "Спецобувь для мужчин",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Балетки для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Босоножки для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Ботинки для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Домашняя обувь для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Кроссовки и кеды для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Мокасины для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Сандалии для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Сапоги для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Слипоны для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Спортивная обувь для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Танцевальная обувь для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Треккинговая обувь для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Туфли для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для девочек",
      "3": "Шлепанцы для девочек",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Ботинки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Домашняя обувь для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Кроссовки и кеды для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Мокасины для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Сандалии для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Сапоги для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Слипоны для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Спортивная обувь для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Танцевальная обувь для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Треккинговая обувь для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Туфли для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Обувь",
      "2": "Обувь для мальчиков",
      "3": "Шлепанцы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Брюки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Джинсы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Домашние футболки и майки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Кардиганы и джемперы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Карнавальные костюмы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Колготки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Комбинезоны для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Комплекты верхней одежды для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Комплекты одежды для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Купальники для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Легкие куртки и ветровки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Носки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Пальто для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Парки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Пиджаки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Пижамы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Плавки и топы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Платья и сарафаны для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Плащи для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Пляжные комбинезоны для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Пуховики и зимние куртки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Рубашки и блузки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Спортивные костюмы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Толстовки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Трусы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Футболки и лонгсливы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Халаты для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Школьные блузки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Школьные брюки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Школьные жилеты для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Школьные костюмы для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Школьные пиджаки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Школьные платья для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Школьные юбки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Шорты для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Девочкам",
      "3": "Юбки для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женское нижнее белье",
      "3": "Женское термобелье",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Бюстгальтеры",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские блузки и рубашки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские боди",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские брюки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские джинсы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские домашние брюки и шорты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские домашние футболки и лонгсливы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские дубленки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские кардиганы и джемперы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские карнавальные костюмы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские колготки и чулки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские комбинезоны",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские купальники",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские легкие куртки и ветровки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские лифы и плавки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские носки и гольфы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские пальто",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские парео",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские парки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские пиджаки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские пижамы и домашние комплекты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские платья и сарафаны",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские плащи и тренчкоты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские пляжные платья и туники",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские повседневные и деловые костюмы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские пуховики и зимние куртки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские свадебные платья",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские спортивные костюмы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские толстовки и свитшоты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские топы и майки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские трусы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские футболки и лонгсливы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские халаты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские шорты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские шубы и меховые жилеты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женские юбки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женское корректирующее белье",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Женское эротическое белье",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Комплекты женского нижнего белья",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Пижамы и комплекты для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Спецодежда для женщин",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Женщинам",
      "3": "Халаты для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Брюки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Джинсы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Домашние футболки и майки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Кардиганы и джемперы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Карнавальные и национальные костюмы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Колготки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Комбинезоны для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Комплекты верхней одежды для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Комплекты одежды для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Купальные плавки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Легкие куртки и ветровки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Носки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Пальто для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Парки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Пиджаки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Пижамы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Плащи для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Пуховики и зимние куртки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Рубашки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Спортивные костюмы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Толстовки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Трусы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Футболки и лонгсливы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Халаты для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Школьные брюки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Школьные жилеты для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Школьные костюмы для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Школьные пиджаки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Школьные рубашки для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мальчикам",
      "3": "Шорты для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужское нижнее белье",
      "3": "Мужское термобелье",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские брюки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские деловые костюмы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские джинсы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские домашние брюки и шорты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские домашние футболки и толстовки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские дубленки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские кардиганы и джемперы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские карнавальные костюмы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские легкие куртки и ветровки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские носки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские пальто",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские парки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские пиджаки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские пижамы и домашние комплекты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские плавки и шорты для плавания",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские пуховики и зимние куртки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские рубашки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские спортивные костюмы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские толстовки и свитшоты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские трусы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские футболки и майки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские халаты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские шорты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Мужские шубы",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужчинам",
      "3": "Спецодежда для мужчин",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Мужская верхняя одежда",
      "3": "Мужские плащи и тренчкоты",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Нижнее белье для девочек",
      "3": "Бюстгальтеры для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Нижнее белье для девочек",
      "3": "Термобелье для девочек",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Нижнее белье для мальчиков",
      "3": "Термобелье для мальчиков",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Брюки для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Бюстгальтеры для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Джинсы для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Женские колготки для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Женские трусы для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Кардиганы и джемперы для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Комбинезоны для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Комплекты нижнего белья для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Костюмы для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Легкие куртки и ветровки для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Платья и сарафаны для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Пуховики и зимние куртки для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Рубашки и блузки для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Толстовки и свитшоты для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Топы и майки для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Футболки и лонгсливы для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Шорты для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для беременных",
      "3": "Юбки для беременных",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Боди и песочники для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Брюки и шорты для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Верхняя одежда для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Головные уборы и варежки для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Домашняя одежда",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Колготки для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Комбинезоны и слипы для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Комплекты одежды для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Конверты для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Купальники и плавки для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Носки и пинетки для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Платья и юбки для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Ползунки",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Распашонки (не использовать)",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Распашонки, лонгсливы, толстовки для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Рубашки и блузки для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Одежда для новорожденных",
      "3": "Футболки и майки для малышей",
      "percent": "11%"
    },
    {
      "1": "Одежда",
      "2": "Школьная форма для девочек",
      "3": "Школьные фартуки для девочек",
      "percent": "11%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Воздушные шары",
      "3": "Насосы для воздушных шаров",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Карнавальные аксессуары",
      "3": "Временные тату",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Карнавальные аксессуары",
      "3": "Карнавальные головные уборы",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Карнавальные аксессуары",
      "3": "Карнавальные маски",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Карнавальные аксессуары",
      "3": "Карнавальные наборы аксессуаров",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Карнавальные аксессуары",
      "3": "Карнавальные парики",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Елочные украшения",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Искусственный снег",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Кабели для гирлянд",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Крючки и аксессуары для гирлянд",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Мишура, дождик",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Новогодние венки",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Новогодние елки",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Новогодний декор",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Световые фигуры",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Хвойные украшения",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Новогодние товары",
      "3": "Электрогирлянды",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Букеты из игрушек",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Именные подарки",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Корзины с фруктами не активна",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Открытки и конверты для денег",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Подарочные наборы",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Подарочные наборы сладостей не активна",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Подарочные сертификаты и абонементы",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Поздравительные адресные папки",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Съедобные букеты и корзины",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Трофеи и награды",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Фотоальбомы",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарки",
      "3": "Живые бабочки",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарочная упаковка",
      "3": "Бонбоньерки",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарочная упаковка",
      "3": "Декоративные банты и ленты",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарочная упаковка",
      "3": "Подарочная упаковочная бумага",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарочная упаковка",
      "3": "Подарочные коробки",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Подарочная упаковка",
      "3": "Подарочные пакеты",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Сувенирная продукция",
      "3": "Магниты сувенирные",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Сувенирная продукция",
      "3": "Сувенирное оружие",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Сувенирная продукция",
      "3": "Сувенирные деньги",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Сувенирная продукция",
      "3": "Сувениры из камня",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Воздушные шары",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Гирлянды и растяжки",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Наполненные воздушные шары",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Небесные фонарики",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Праздничный декор",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Свечи для торта",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Украшения для коктейлей",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Фейерверки",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Фотобутафория",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Украшения для праздников",
      "3": "Цветной дым",
      "percent": "10%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Цветы и букеты",
      "3": "Аксессуары для флористики",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Цветы и букеты",
      "3": "Свадебные букеты",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Цветы и букеты",
      "3": "Стабилизированные цветы",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Цветы и букеты",
      "3": "Сухоцветы",
      "percent": "7%"
    },
    {
      "1": "Подарки, товары для праздников",
      "2": "Цветы и букеты",
      "3": "Цветы",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Абсент, Самбука",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Бренди",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Вермут",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Вино",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Виски",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Водка",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Джин",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Игристые вина, шампанское",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Ингредиенты для приготовления алкоголя",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Кальвадос",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Коньяк",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Ликер",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Настойки и бальзамы",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Пиво",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Портвейн",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Ром",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Сидр",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Текила",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Алкоголь",
      "3": "Чача",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Все для выпечки",
      "3": "Декор для выпечки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Все для выпечки",
      "3": "Дрожжи (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Все для выпечки",
      "3": "Ингредиенты для выпечки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Все для выпечки",
      "3": "Мука",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Все для выпечки",
      "3": "Пищевые красители",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Все для выпечки",
      "3": "Смеси для выпечки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Готовая еда",
      "3": "Заготовки для приготовления блюд",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Готовая еда",
      "3": "Шашлыки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженная выпечка и десерты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженная готовая еда",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженная рыба (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженное тесто (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженные грибы ( не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженные морепродукты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженные овощи, смеси, грибы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженные полуфабрикаты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженные полуфабрикаты из птицы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты",
      "3": "Замороженные фрукты и ягоды",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Замороженные продукты, мороженое",
      "3": "Лед",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание",
      "3": "Диабетические кондитерские изделия",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание",
      "3": "Диабетические напитки и цикорий",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание - готовая еда",
      "3": "Боулы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание - готовая еда",
      "3": "Вторые блюда",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание - готовая еда",
      "3": "Десерты, выпечка",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание - готовая еда",
      "3": "Каши, яичницы, гранола",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание - готовая еда",
      "3": "Напитки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание - готовая еда",
      "3": "Салаты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание - готовая еда",
      "3": "Суши и роллы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Здоровое питание - готовая еда",
      "3": "Сэндвичи, бутерброды",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Колбасы, сосиски, деликатесы",
      "3": "Колбасы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Колбасы, сосиски, деликатесы",
      "3": "Сосиски, сардельки, колбаски",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Бобы консервированные",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Варенье, джемы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Готовые блюда консервированные (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Грибы консервированные",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Маслины, оливки, каперсы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Мед и продукты пчеловодства",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Мясная консервация",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Овощная консервация",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Рыбная консервация",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Томатная паста",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Фруктово-ягодная консервация",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Консервация",
      "3": "Холодные блюда и закуски",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Крупы, хлопья, макароны",
      "3": "Каши и мюсли",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Крупы, хлопья, макароны",
      "3": "Крупы и бобовые",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Крупы, хлопья, макароны",
      "3": "Лапша и пюре быстрого приготовления",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Крупы, хлопья, макароны",
      "3": "Макаронные изделия",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Бульоны и заправки для супа",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Горчица и хрен",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Майонез",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Маринады и аджика",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Растительные масла",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Сахар и заменители",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Сиропы и топпинги",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Соль",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Соусы, кетчупы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Специи и приправы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Масла, специи, соусы",
      "3": "Уксус",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Закваски для молочных продуктов",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Йогурт",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Кефир, Тан, Айран",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Курт, жент",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Масло, маргарин",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Молоко, Сухое молоко, Сливки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Питьевые йогурты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Растительное молоко, сливки, коктейли",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Ряженка, простокваша (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Сгущенное молоко",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Сливки (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Сметана",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Сухое молоко, сливки (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Сыр",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Сырки и бисквиты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Тан, айран, кумыс (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Творог и творожная масса",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Творожки и десерты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Молочные продукты, яйца",
      "3": "Яйца",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Мясо и птица",
      "3": "Мясные полуфабрикаты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Мясо и птица",
      "3": "Мясо",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Мясо и птица",
      "3": "Птица",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Овощи, фрукты, ягоды, грибы",
      "3": "Грибы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Овощи, фрукты, ягоды, грибы",
      "3": "Зелень, салаты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Овощи, фрукты, ягоды, грибы",
      "3": "Овощи",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Овощи, фрукты, ягоды, грибы",
      "3": "Фрукты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Овощи, фрукты, ягоды, грибы",
      "3": "Ягоды",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Продукты питания",
      "3": "Пищевые консерванты, антиоксиданты",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Продукты питания",
      "3": "Соевое, растительное мясо, колбасы сосиски",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Рыба, морепродукты",
      "3": "Икра",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Рыба, морепродукты",
      "3": "Морепродукты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Рыба, морепродукты",
      "3": "Полуфабрикаты из рыбы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Рыба, морепродукты",
      "3": "Пресервы",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Рыба, морепродукты",
      "3": "Рыба",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Восточные сладости",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Жевательная резинка",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Зефир и пастила",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Кексы и рулеты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Конфеты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Мармелад",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Мороженое",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Печенье и крекеры",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Пирожные, бисквиты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Пряники и вафли",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Сушки и баранки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Торты, пирожные, бисквиты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Фрукты и орехи в глазури",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Шоколад и шоколадные батончики",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Шоколадная и ореховая паста",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости",
      "3": "Шоколадные конфеты (не использовать)",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости и выпечка",
      "3": "Кукурузные палочки",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости и выпечка",
      "3": "Пироги",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Сладости и выпечка",
      "3": "Сладкие подарочные наборы",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Соки, вода, напитки",
      "3": "Вода",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Соки, вода, напитки",
      "3": "Газированные напитки и лимонады",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Соки, вода, напитки",
      "3": "Квас",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Соки, вода, напитки",
      "3": "Смеси для приготовления десертов и напитков",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Соки, вода, напитки",
      "3": "Соки, нектары, морсы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Соки, вода, напитки",
      "3": "Холодный кофе",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Соки, вода, напитки",
      "3": "Холодный чай",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Соки, вода, напитки",
      "3": "Энергетические напитки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Сублимированная туристическая еда",
      "3": "Вторые блюда сублимированные",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Сублимированная туристическая еда",
      "3": "Каши сублимированные",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Сублимированная туристическая еда",
      "3": "Первые блюда сублимированные",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Хлеб и выпечка",
      "3": "Выпечка и сдоба",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Хлеб и выпечка",
      "3": "Хлеб, лаваш, лепешки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Хлебные изделия",
      "3": "Тарталетки",
      "percent": "7%"
    },
    {
      "1": "Продукты питания",
      "2": "Чай, кофе, какао",
      "3": "Какао и горячий шоколад",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чай, кофе, какао",
      "3": "Капсулы для кофемашин",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чай, кофе, какао",
      "3": "Кофе зерновой и молотый",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чай, кофе, какао",
      "3": "Кофе растворимый",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чай, кофе, какао",
      "3": "Цикорий",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чай, кофе, какао",
      "3": "Чай",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Батончики",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Закуски",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Морские водоросли, листы для суши",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Овощные, фруктовые и ягодные снеки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Орехи",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Попкорн",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Семечки и семена",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Суперфуды",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Сухарики и гренки",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Сухофрукты",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Хлебцы",
      "percent": "6%"
    },
    {
      "1": "Продукты питания",
      "2": "Чипсы, орехи, снэки",
      "3": "Чипсы",
      "percent": "6%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Аксессуары для велосипедов",
      "3": "Велокосметика",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Аксессуары для велосипедов",
      "3": "Запчасти для велосипедных насосов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Аксессуары для велосипедов",
      "3": "Сигнализации для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Аксессуары и запчасти для скейтбордов",
      "3": "Деки для скейтбордов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Аксессуары и запчасти для скейтбордов",
      "3": "Колеса для скейтбордов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Аксессуары и запчасти для скейтбордов",
      "3": "Подвески для скейтбордов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Аксессуары и запчасти для скейтбордов",
      "3": "Подшипники для скейтбордов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Аксессуары для альпинизма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Блок-ролики для альпинизма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Веревки для альпинизма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Гамаши для туризма и альпинизма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Зажимы для альпинизма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Карабины для альпинизма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Кошки альпинистские",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Ледоступы альпинистские",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Ледорубы для альпинизма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Мешочки и ремешки для спортивной магнезии",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Слэклайн",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Снегоступы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Спортивная магнезия",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Страховочные системы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Альпинизм и скалолазание",
      "3": "Скальные туфли для альпинизма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бейсбольные биты",
      "3": "Бейсбольные биты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бильярд",
      "3": "Аксессуары для бильярда",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бильярд",
      "3": "Бильярдные светильники",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бильярд",
      "3": "Киевницы и полочки для шаров",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бильярд",
      "3": "Перчатки для бильярда",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бильярд",
      "3": "Треугольники для бильярда",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бильярд",
      "3": "Чехлы для бильярдных столов",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бокс и единоборства",
      "3": "Бинты для единоборств",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бокс и единоборства",
      "3": "Боксерские перчатки",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бокс и единоборства",
      "3": "Основания и крепления для тренировочных снарядов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бокс и единоборства",
      "3": "Перчатки для единоборств",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Бокс и единоборства",
      "3": "Тренировочные снаряды для бокса и единоборств",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Багажники для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велокомпьютеры",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велосипедные замки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велосипедные звонки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велосипедные седла",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велосипедные спортивные очки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велосипеды",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велостанки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велосумки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Велотуфли",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Вилки для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Втулки для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Выносы руля для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Грипсы для велосипеда",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Зеркала заднего вида для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Камеры для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Каретки для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Кассеты, звезды и шатуны для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Колеса для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Колпачки и ниппели для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Кронштейны для хранения велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Крылья для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Наборы инструментов для ремонта и чистки велосипеда",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Насосы для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Педали для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Переключатели скоростей для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Подножки для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Подседельные штыри для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Покрышки для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Рамы для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Рули для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Тормоза для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Фляги и флягодержатели для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Фонари для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Цепи для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Чехлы для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Велоспорт",
      "3": "Электровелосипеды",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Баллоны для дайвинга",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Беруши для плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Буи для плавания",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Гидрокостюмы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Гидрообувь",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Доски для SUP-серфинга",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Дополнительные аксессуары для водного спорта",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Доски для кайтсерфинга",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Доски для плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Зажимы для носа и беруши для плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Измерительные приборы для подводного плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Инвентарь для аквааэробики",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Кайты для кайтсерфинга",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Ласты для плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Лопатки для плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Маски и трубки для подводного плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Надувные водные аттракционы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Очки для плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Тормозные пояса для плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Фонари для подводного плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Чехлы для очков и масок",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Водный спорт",
      "3": "Шапочки для плавания",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Адаптеры для велосипедных тормозов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Аккумуляторы для электровелосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Велосипедные петухи",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Велосипедные успокоители и натяжители",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Гидролинии и фитинги",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Двигатели для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Другие запчасти для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Запчасти для крыльев велосипеда",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Запчасти для флягодержателей и велосипедных сумок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Защита цепи, перьев, переключателей и звезд",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Контроллеры для электровелосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Обода для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Рулевые колонки для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Запчасти для велосипедов",
      "3": "Тормозные колодки для велосипедов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Аксессуары для зимнего снаряжения",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Антифог для очков и масок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Ботинки для лыж",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Ботинки для снегоходов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Ботинки для сноубордов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Визоры для горнолыжных шлемов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Заточка для коньков",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Инструменты для ремонта зимнего снаряжения",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Коньки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Крепления для лыж",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Крепления для сноубордов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Кронштейны для хранения сноубордов и лыж",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Ледянки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Лезвия для коньков",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Лыжи",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Маски горнолыжные",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Палки для лыж",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Санки и снегокаты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Сноуборды",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Сумки и чехлы для зимнего снаряжения",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Тюбинги",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Хоккейные клюшки",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Зимний спорт",
      "3": "Шлемы спортивные",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Кемпинг",
      "3": "Аккумуляторы холода для термосумок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Кемпинг",
      "3": "Комплектующие для походных бань",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Кемпинг",
      "3": "Походные биотуалеты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Кемпинг",
      "3": "Туристические подушки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Кемпинг",
      "3": "Портативные зарядные устройства для кемпинга",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Кемпинг",
      "3": "Печные вентиляторы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Вальтрапы для лошадей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Недоуздки для лошадей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Ногавки для лошадей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Одежда для верховой езды",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Сапоги для верховой езды",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Седла для лошади",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Стремена для верховой езды",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Попоны для лошадей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Конный спорт",
      "3": "Чумбуры для лошадей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Легкая атлетика",
      "3": "Диски и мячи для метания",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Легкая атлетика",
      "3": "Дополнительный инвентарь для легкой атлетики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Легкая атлетика",
      "3": "Легкоатлетические копья для метания",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Легкая атлетика",
      "3": "Стартовые колодки для легкой атлетики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Легкая атлетика",
      "3": "Эстафетные палочки для легкой атлетики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Пауэрлифтинг",
      "3": "Бинты для пауэрлифтинга",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Пауэрлифтинг",
      "3": "Лямки и манжеты для тяги",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Пауэрлифтинг",
      "3": "Тяжелоатлетические помосты",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Роликобежный спорт",
      "3": "Лыжероллеры",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Роликобежный спорт",
      "3": "Роликовые коньки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Аккумуляторы для электросамокатов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Аксессуары для гироскутеров",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Аксессуары и запчасти для самокатов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Вилки для самокатов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Гироскутеры и моноколеса",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Грипсы для самокатов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Деки и шкурки для самокатов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Самокаты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Скейтборды и лонгборды",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Самокаты, гироскутеры, моноколеса",
      "3": "Тормоза для самокатов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Атлетические пояса",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Гимнастические накладки",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Защитные шорты",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Капы спортивные",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Кинезио тейпы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Наборы спортивной защиты",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Нагрудники",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Наколенники",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Налокотники",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Спортивные бандажи",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Спортивные напульсники",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Спортивные перчатки и варежки",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Спортивные повязки на голову",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Хоккейные ловушки и блины для вратаря",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита",
      "3": "Щитки",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита и экипировка",
      "3": "Спортивные очки",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная защита и экипировка",
      "3": "Замораживающие спреи для спортсменов",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная одежда и обувь",
      "3": "Горнолыжные брюки",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная одежда и обувь",
      "3": "Горнолыжные костюмы",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная одежда и обувь",
      "3": "Горнолыжные куртки",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная одежда и обувь",
      "3": "Спортивная форма",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивная одежда и обувь",
      "3": "Термобелье",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Аминокислоты и BCAA",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Гейнеры",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Детокс комплексы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Жиросжигатели",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Изотоники и энергетические гели",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Креатин",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Посттренировочные комплексы для спортсменов",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Предтренировочные комплексы для спортсменов",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Препараты для укрепления связок и суставов",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Протеин",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Специальное питание для спортсменов",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Тестостероновые бустеры",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивное питание",
      "3": "Шейкеры и бутылки для спортсменов",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Аксессуары для настольного тенниса",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Аксессуары для спортивных игр",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Бильярдные столы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Бильярдные шары",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Бильярдный мел",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Бумеранги",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Воланы для бадминтона",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Дротики для дартса",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Игровые столы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Кабинеты и стойки для дартса",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Канаты спортивные",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Кии бильярдные",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Мишени для дартса",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Наборы для гольфа",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Наборы для игры в крокет",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Ракетки для бадминтона",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Ракетки для большого тенниса",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Спортивные луки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Спортивные мячи",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Спортивные сетки",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Стойки и кольца для баскетбола",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Столы для настольного тенниса",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Струны для теннисных ракеток",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Товары для флорбола",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Фрисби",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Футбольные ворота",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Спортивные игры",
      "3": "Чехлы для бильярдных киев",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для дайвинга и подводной охоты",
      "3": "Сумки для подводной охоты и дайвинга",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для йоги",
      "3": "Блоки для йоги",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для йоги",
      "3": "Болстеры для йоги",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для йоги",
      "3": "Гамаки для йоги",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для йоги",
      "3": "Доски Садху",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для йоги",
      "3": "Ремни для йоги",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для оснасток",
      "3": "Готовые оснастки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для оснасток",
      "3": "Дополнительные инструменты для оснасток",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для оснасток",
      "3": "Инструменты для заточки крючков",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для оснасток",
      "3": "Клей для оснасток",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для оснасток",
      "3": "Крючки для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для оснасток",
      "3": "Ледкоры и трубки-противозакручиватели",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для оснасток",
      "3": "Силиконовые трубки, лентяйки, термоусадка",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для оснасток",
      "3": "Стопора и крепления для насадок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Аксессуары для страйкбольного оружия",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Аксессуары для охоты с птицами",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Аккумуляторы для оптики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Аксессуары для охоты и стрельбы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Газовые балончики для страйкбольного оружия",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Гарпуны для подводной охоты",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Дальномеры для охоты",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Зарядные устройства для страйкбольного оружия",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Запасные части для пейнтбольного оборудования",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Защитные очки для стрельбы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Защитные маски для стрельбы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Инструменты для чистки оружия",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Капканы для охоты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Камеры для наблюдения за мишенью",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Кобуры для оружия",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Крепления для оптических прицелов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Манки для охоты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Наушники для стрельбы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Одежда для охоты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Оружие для подводной охоты",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Патронташи для охоты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Приклады для оружия",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Портативные метеостанции",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Прицелы для охоты и стрельбы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Приспособления для стрельбы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Ремни ружейные",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Рогатки для спортивной стрельбы и охоты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Средства для чистки оружия",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Станки и упоры для пристрелки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Страйкбольные пистолеты",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Сумки и ящики для охоты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Тепловизоры для охоты",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Чехлы для страйкбольного оружия",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Чучела для охоты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Шарики для рогаток",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Шары и пули для пневматического оружия",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Шары для пейнтбола",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для охоты и стрельбы",
      "3": "Хронографы для стрельбы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Аксессуары для подводных камер",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Аксессуары для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Бытовые метеостанции",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Весы для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Винты для лодочных моторов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Грузила для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Жерлицы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Запчасти для лодочных моторов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Комплектующие для ледобуров",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Комплектующие для лодочных моторов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Комплектующие для надувных лодок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Кормушки для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Куканы для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Ледобуры для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Лодочные весла",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Лодочные моторы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Масла для лодочных моторов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Надувные лодки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Ножи для ледобуров",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Одежда для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Подводные камеры",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Подставки под удилища",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Поплавки для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Прикормки для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Приманки и мормышки для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Рыболовная леска и поводки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Рыболовные зонты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Рыболовные катушки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Рыболовные наборы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Рыболовные сети",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Лодки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Садки и подсачеки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Санки рыбацкие",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Сигнализаторы поклевки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Сигнальные средства",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Сиденья для надувных лодок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Средства для ремонта надувных лодок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Спасательные жилеты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Сумки и ящики для рыбалки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Сушилки для рыбы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Транцы для лодок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Удилища",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Фидерные платформы и кресла",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Шнеки для ледобуров",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Шпули для рыболовных катушек",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для рыбалки",
      "3": "Эхолоты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для самообороны",
      "3": "Аксессуары для наручников",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для самообороны",
      "3": "Наручники",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Аксессуары для батутов",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Балансборды",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Балансировочные тренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Бодибары",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Веревочные лестницы",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Гантели и наборы гантелей",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Гимнастические кольца",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Гири",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Каркасные батуты",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Кистевые тренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Коврики для занятий йогой и фитнесом",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Кольца для пилатеса",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Массажные ролики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Наборы для фитнеса",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Обручи для фитнеса",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Одежда для похудения",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Парашюты для бега",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Пульсометры и шагомеры",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Ролики для пресса",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Роликовые тренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Ручки для эспандеров",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Секундомеры",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Скакалки для фитнеса",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Спортивные маты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Спортивные площадки",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Степ-платформы",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Тренировочные петли",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Турники",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Упоры для отжиманий",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Упоры для пресса",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Утяжелители",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Фитболы и медболы для занятий фитнесом",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Фитнес абонементы",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Чехлы для спортивных ковриков",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Шведские стенки",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Энергетические браслеты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Эспандеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Товары для фитнеса",
      "3": "Ядра для толкания",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Беговые дорожки",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Велотренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Гиперэкстензии",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Гравитационные ботинки",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Гребные тренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Джамперы",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Детские тренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Диски для штанг",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Дополнительное оборудование для тренажеров",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Другие силовые тренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Замки для грифов",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Инверсионные столы",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Пого Стики",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Райдеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Силовые рамы и машины Смита",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Силовые тренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Скамьи и стойки",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Степперы",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Штанги",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Тренажеры",
      "3": "Эллиптические тренажеры",
      "percent": "11%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для металлоискателей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для палаток",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для спальников и туристических ковриков",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для спортивных рюкзаков",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для треккинговых палок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для туристических горелок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для туристических ножей и мультитулов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для туристических фонарей",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Беруши для путешествий",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Бинокли и зрительные трубы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Газовые баллончики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Газовые баллоны для туристических горелок",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Гермомешки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Зарядные устройства и аккумуляторы для металлоискателей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Канистры для воды",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Катушки для металлоискателей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Компасы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Мачете",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Металлоискатели",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Метательные ножи",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Мультитулы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Наушники для металлоискателей",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Наборы для путешествий",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Ножи для туризма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Огнива",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Палатки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Питьевые системы",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Походная мебель",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Походные бани",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Походные души и рукомойки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Походные печи",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Приборы ночного видения",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Раскладушки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Солнечные панели для туризма",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Спальные мешки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Спортивные рюкзаки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Спортивные сумки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Сумки-холодильники",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Телескопы",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Тенты и шатры туристические",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Термосы и термокружки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Треккинговые палки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Туристическая посуда",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Туристические горелки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Туристические грелки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Туристические инструменты",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Туристические коврики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Туристические курвиметры",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Туристические наборы для выживания",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Туристические фонари",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Фотоловушки",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Чехлы для туристических ножей и мультитулов",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Чехлы и накидки для спортивных рюкзаков",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Чехлы и ремни для биноклей",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Туризм и отдых на природе",
      "3": "Аксессуары для фотоловушек",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Хоккей",
      "3": "Наборы для хоккея",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Хоккей",
      "3": "Хоккейные ленты для клюшек и щитков",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Хоккей",
      "3": "Шайбы и мячи для хоккея",
      "percent": "10%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Аксессуары для художественной гимнастики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Булавы для художественной гимнастики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Купальники для художественной гимнастики и танцев",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Ленты для художественной гимнастики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Мячи для художественной гимнастики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Обмотка для гимнастических обручей и булав",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Обручи для художественной гимнастики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Палочки для художественной гимнастики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Подушки для кувырков",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Скакалки для художественной гимнастики",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Тренажеры, подушки и ленты для растяжки",
      "percent": "7%"
    },
    {
      "1": "Спорт, туризм",
      "2": "Художественная гимнастика и танцы",
      "3": "Чехлы для художественной гимнастики",
      "percent": "7%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Автомобильные инверторы и преобразователи напряжения",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Быстрозажимные гайки для балансировочных станков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Гидроцилиндры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Емкости для сбора масла",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Инспекционные зеркала для досмотра автомобиля",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Инструмент для поршневой группы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Инструменты для ремонта ГБЦ",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Инструменты для тормозной системы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Катушки раздаточные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Клещи для хомутов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Ключи и головки для лямбда-зонда",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Комплектующие для смазочных шприцов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Комплектующие к домкратам",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Магнитные захваты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Магнитные поддоны и тарелки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Приборы для диагностики авто",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Рихтовочный инструмент для кузовных работ",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Ручные гайковерты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Стеклодомкраты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Стойки для покраски деталей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Съемники для рулевой",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Съемники клип и пистонов обшивки салона",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Фильтры окрасочных камер",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоинструменты",
      "3": "Шланги для отвода выхлопных газов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Автоматические выключатели и дифференциальные автоматы",
      "3": "Низковольтные устройства различного назначения и аксессуары",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Аккумуляторы и зарядные устройства для инструментов",
      "3": "Адаптеры для аккумуляторов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Бетономешалки и комплектующие",
      "3": "Комплектующие для бетономешалок",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Водоснабжение",
      "3": "Аппараты для прочистки труб",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Водоснабжение",
      "3": "Гибкие подводки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Водоснабжение",
      "3": "Инструменты для прочистки труб",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Водоснабжение",
      "3": "Сантехнические хомуты",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Водоснабжение",
      "3": "Станции управления для погружных насосов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Водоснабжение",
      "3": "Уплотнители резьбовых соединений",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Водоснабжение",
      "3": "Шланги и рукава ассенизаторские",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ворота и ограждения",
      "3": "Ограждения",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ворота и ограждения",
      "3": "Ограждения для парковки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ванны и комплектующие",
      "3": "Душевые шторки на ванну",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ванны и комплектующие",
      "3": "Прочие комплектующие для ванн",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ворота и автоматика для ворот",
      "3": "Заборы и калитки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Газовые баллоны и принадлежности",
      "3": "Бытовые регуляторы давления газа",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Газовые баллоны и принадлежности",
      "3": "Чехлы для газовых баллонов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Гипсокартон и аксессуары",
      "3": "Подвесы профиля и крепеж для гипсокартона",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Аксессуары для дверных звонков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Ворота",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Входные двери",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Дверные доводчики",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Дверные задвижки и шпингалеты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Дверные звонки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Дверные коробки, наличники и доборы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Дверные ручки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Двери и окна",
      "3": "Дверные глазки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Дверные цилиндры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Замки врезные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Замки навесные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Кованые изделия для ворот",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Комплектующие к замкам",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Межкомнатные двери",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Межкомнатные перегородки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Москитные сетки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Ограничители открывания для дверей и окон",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Оконные уплотнители",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Петли дверные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Пластиковые окна",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Подоконники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Почтовые ящики",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Двери и окна",
      "3": "Противопожарные двери",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Пульты для шлагбаумов и ворот",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Рольставни",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Ручки для окон",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Секционные гаражные ворота",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Шаблоны для врезки петель и замков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Шлагбаумы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Двери и окна",
      "3": "Электронные замки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Древесно-плитные материалы",
      "3": "Мебельные щиты из дерева",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Древесно-плитные материалы",
      "3": "Цементно-стружечные плиты",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Душевые кабины, ограждения и аксессуары",
      "3": "Фурнитура для душевых кабин",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Запорная арматура",
      "3": "Балансировочные и регулирующие клапаны",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Запорная арматура",
      "3": "Коллекторы и коллекторные группы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Запорная арматура",
      "3": "Запорные клапаны",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Запорная арматура",
      "3": "Обратные клапаны",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Запорная арматура",
      "3": "Фильтры механической очистки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Изоляционные материалы",
      "3": "Строительные тенты",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Изолирующие зажимы, наконечники, клеммы, соединительные гильзы",
      "3": "Гильзы соединительные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Изделия для электромонтажных работ",
      "3": "Кабельные муфты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Изделия для электромонтажных работ",
      "3": "Кабельные сальники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Изделия для электромонтажных работ",
      "3": "Комплектующие для молниезащиты и заземления",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Изделия для электромонтажных работ",
      "3": "Контактные токопроводящие пасты",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Изделия для электромонтажных работ",
      "3": "Ленты нержавеющие",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Изделия для электромонтажных работ",
      "3": "Маркировка кабеля",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Изделия для электромонтажных работ",
      "3": "Монтажные площадки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Измерительные инструменты",
      "3": "Аксессуары для измерительных инструментов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Измерительные инструменты",
      "3": "Аксессуары для нивелиров и лазерных уровней",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Измерительные инструменты",
      "3": "Токовые клещи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Изоляционные материалы",
      "3": "Межвенцовый утеплитель",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Изоляционные материалы",
      "3": "Огнеупорные материалы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "GNSS оборудование",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "GNSS приемники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Аккумуляторные отвертки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Аккумуляторы для инструментов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Аксессуары для строительных лестниц",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Балонные ключи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Бензиновые гайковерты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Бензорезы и электрорезы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Болгарки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Буры для перфораторов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Валики",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Верстаки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Видеоскопы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Воздушные компрессоры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Воротки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Газовые паяльники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Гвоздезабивные пистолеты и скобозабиватели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Гигрометры и влагомеры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Граверы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Дальномеры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Детекторы проводки, труб и конструкций",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Динамометрические ключи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Диски и чашки шлифовальные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Дисковые пилы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Дрели и шуруповерты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Заклепочники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Зарядные устройства для инструментов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Зубила слесарные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Измерительные рулетки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Инструмент для ремонта холодильного оборудования",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Инструменты для укладки плитки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Клеевые пистолеты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Колеса для тележек",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Комплектующие для алмазного бурения",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Коронки сверлильные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Краскопульты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Лазерные уровни",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Ленточные пилы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Ленточные шлифовальные машины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Ломы и гвоздодеры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Лопаты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Люксметры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Малярные кисти",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Манометры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Мешки-пылесборники для строительных пылесосов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Молотки и кувалды",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Монтажные ножи",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Инструменты",
      "3": "Монтерские лазы, когти и комплектующие",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Мотобуры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Мультиметры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Наборы инструментов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Наборы пневмоинструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Наборы электроинструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Напильники и надфили",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Направляющие и упоры для инструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Насадки для размешивания растворов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Ножи для рубанков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Опрессовочные насосы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Оптические нивелиры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Отбойные молотки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Отвертки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Отрезные диски",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Патроны для дрелей и шуруповертов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Перфораторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пилки для электролобзиков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пильные диски",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пирометры и тепловизоры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пистолеты для герметиков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пистолеты для монтажной пены",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Плиткорезы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Плоскогубцы и пассатижи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Плоскошлифовальные машины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Плунжерные шприцы для смазки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пневмогайковерты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пневмодрели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пневмопистолеты для накачки шин",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пневмотрещотки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пневмофитинги",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Пневмошлифмашины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Полотна для пил",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Просекатели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Прочие измерительные инструменты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Разгрузочные сумки и пояса монтажника",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Реноваторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Рожковые, накидные и комбинированные ключи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Рубанки ручные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Ручные пилы и ножовки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Ручные уровни",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Сабельные пилы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Сантехнические, разводные ключи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Сверла",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Системы пылеудаления для электроинструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Скобы для строительного степлера",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Стамески",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Строительные лестницы и стремянки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Строительные линейки и угольники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Строительные ножницы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Строительные терки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Строительные фены",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Строительные ходули",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Строительные электроножницы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Струбцины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Стусла",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Сумки и ящики для инструментов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Съемники подшипников",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Съемники пружин",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Съемники стопорных колец",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Тахеометры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Теодолиты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Тиски",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Толщиномеры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Топоры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Торцевые головки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Трещотки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Трубогибы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Труборезы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Угломеры и уклономеры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Удлинители для торцевых головок и бит",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Установки для алмазного бурения",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Фильтросъемники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Фильтры, влагоотделители и лубрикаторы для пневмоинструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Фонари строительные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Фрезеры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Фрезы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Хоппер ковши",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Цепи и шины для электро- бензопил",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Цепные пилы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Шарниры карданные для торцевых головок",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Шестигранные ключи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Шланги для компрессоров",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Шлифовальные круги",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Шлифовальные щетки и валики для щеточных шлифмашин",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Шпатели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Штангенциркули",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Штативы для нивелиров",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Штроборезы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Электрические паяльники и паяльные станции",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Электролобзики",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты",
      "3": "Электрорубанки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Инструменты для столярных работ",
      "3": "Металлические щетки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Емкости для смешивания красок",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Емкости для строительных работ",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Инструменты для наливных полов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Кельмы и мастерки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Малярные ванночки и кюветы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Обувь для заливки наливного пола",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Разметочный инструмент",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Строительные сита",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Инструменты для штукатурных и малярных работ",
      "3": "Трафареты для стен",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Кабельная продукция",
      "3": "Комплектующие для гофрированных труб и металлорукавов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Кабельная продукция",
      "3": "Оплетка кабельная",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Кабеленесущие системы",
      "3": "Комплектующие для электромонтажных труб",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Кабеленесущие системы",
      "3": "Напольные и настольные лючки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Клеи и жидкие гвозди",
      "3": "Жидкие гвозди",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Клеи и жидкие гвозди",
      "3": "Клеи для напольных покрытий",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Кровельные материалы",
      "3": "Композитная черепица",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Кровельные материалы",
      "3": "Кровельная вентиляция",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Кровельные материалы",
      "3": "Навесы и козырьки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Кровельные материалы",
      "3": "Рулонная кровля",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Кровельные материалы",
      "3": "Шифер",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Лакокрасочные материалы",
      "3": "Морилки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Металлопрокат",
      "3": "Винтовые сваи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Напольные покрытия",
      "3": "Плитка ПВХ",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Напольные покрытия",
      "3": "Подложка под паркет и ламинат",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Напольные покрытия",
      "3": "Порожные планки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оборудование для прочистки труб",
      "3": "Промывочные насосы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Окна, подоконники и аксессуары",
      "3": "Мансардные окна",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Окна, подоконники и аксессуары",
      "3": "Оконные откосы",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Окна, подоконники и аксессуары",
      "3": "Оконная фурнитура",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Окна, подоконники и аксессуары",
      "3": "Отливы для окон",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Оснастка для дрелей и шуруповертов",
      "3": "Ключи для патронов дрели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Аксессуары для паяльников",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Аксессуары для малярных установок",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Биты для электроинструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Демонстрационные подставки для инструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Жала для паяльников",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Запчасти для гвоздезабивных пистолетов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Запчасти для электро- и бензоинструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Комплектующие и аксессуары для фрезера",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Комплектующие для насосов и насосных станций",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Комплектующие для трубогибов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Кондукторы для сверления",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Лезвия для гидравлического инструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Масло для цепных пил",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Монтажные патроны",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Насадки для многофункционального инструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Насадки для пресс-перфораторов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Насадки для электроинструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Припои для пайки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Расходные материалы для краскопультов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Ремкомплекты для трещоток",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Рукоятки для ножовок",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Свечи зажигания для бензопил, триммеров, мотобуров",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Смазки для инструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Флюс паяльный",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Шлифовальные листы и шкурки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Шнеки и удлинители для мотобуров",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Оснастка и расходники для инструмента",
      "3": "Хвостовики для коронок",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Оснастка для цепных электро- и бензопил",
      "3": "Инструмент для заточки цепи электро и бензопил",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "3D панели для стен",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Аэрозольные краски",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Декоративная лепнина",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Декоративные краски",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Декоративные рейки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Жидкие обои",
      "percent": "10%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Керамическая плитка",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Ковролин",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Колеровочные веера и каталоги",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Колеровочные средства",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Комплектующие для ПВХ панелей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Крестики для укладки плитки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Ламинат",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Линолеум",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Масла и воск",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "МДФ панели для стен",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Отделочные материалы",
      "3": "Мягкие панели для стен",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Облицовочный камень",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Обои",
      "percent": "10%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Панели ПВХ",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Панно и барельефы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Паркетная доска",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Плинтусы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Плитка из керамогранита",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Потолочная плитка",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Потолочные плинтусы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Самоклеящиеся обои и пленки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Строительные краски",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Строительные лаки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Строительные растворители",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Строительные эмали",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Отделочные материалы",
      "3": "Уголки отделочные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Фактурные декоративные покрытия",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Отделочные материалы",
      "3": "Фартуки для кухни",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Отделочные материалы",
      "3": "Формы для создания 3D панелей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Паяльники и паяльные лампы",
      "3": "Газовые и бензиновые паяльные лампы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Пиломатериалы",
      "3": "Вагонка, имитация бруса и блок-хаус",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Пневмоинструменты",
      "3": "Масло для воздушных компрессоров и пневмоинструмента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Пневмоинструменты",
      "3": "Пневматические отбойные молотки и зубила",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Пневмоинструменты",
      "3": "Пневмолобзики и пилы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Пневмоинструменты",
      "3": "Пневмошуруповерты и пневмоотвертки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Пневмоинструменты",
      "3": "Пневмоножницы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Пневмоинструменты",
      "3": "Продувочные пистолеты",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Пневмоинструменты",
      "3": "Ресиверы для компрессора",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Подвесные потолки",
      "3": "Акустические острова и баффлы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Подвесные потолки",
      "3": "Реечные потолки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Подвесные потолки",
      "3": "Кассетные подвесные потолки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Пожарное оборудование",
      "3": "Рукава пожарные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Пожарное оборудование",
      "3": "Пожарные гидранты и колонки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Полотенцесушители и комплектующие",
      "3": "Аксессуары для полотенцесушителей",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Листовые материалы",
      "3": "Аквапанели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Расходные материалы для укладки плитки",
      "3": "Клинья для укладки плитки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Розетки и выключатели",
      "3": "Выводы кабеля",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Розетки и выключатели",
      "3": "Накладки для выключателей и розеток",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Резчики",
      "3": "Резчики кровли",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Резчики",
      "3": "Резчики швов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ручки, замки и фурнитура для дверей",
      "3": "Пружины",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ручки, замки и фурнитура для дверей",
      "3": "Номера на дверь",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ручки, замки и фурнитура для дверей",
      "3": "Механизмы для раздвижных дверей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Бородки слесарные",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ручные инструменты",
      "3": "Газовоздушные горелки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Кернеры слесарные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Клейма",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ручные инструменты",
      "3": "Клуппы",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ручные инструменты",
      "3": "Коврики для пайки и ремонта электроники",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ручные инструменты",
      "3": "Крючки для вязки арматуры",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Ручные инструменты",
      "3": "Наковальни",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Переходники для торцевых головок",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Пинцеты и монтажные зажимы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Плашки и метчики",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Свечные головки и ключи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Стеклорезы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Шпильковерты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Ручные инструменты",
      "3": "Экстракторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Баки для водоснабжения",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Бачки для унитазов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Ванны",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Водопроводные трубы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Держатели и штанги для душа",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Душевые кабины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Душевые ограждения",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Душевые поддоны",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Души и душевые гарнитуры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Инсталляции для унитазов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Каркасы для ванн",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Комплектующие для водяных фильтров",
      "percent": "10%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Комплектующие для смесителей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Комплектующие для унитазов и писсуаров",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Краны шаровые",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Кухонные мойки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Люки канализационные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Ножки для ванн",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Полотенцесушители",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Пьедесталы для раковин",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Раковины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Ревизионные люки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Септики",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Сиденья для унитазов и биде",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Системы защиты от протечек воды",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Сифоны и трапы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Смесители",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Сушилки для рук",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Счетчики воды",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Унитазы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Фильтры для воды",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Фитинги для металлических труб",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Фитинги для металлопластиковых труб",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Фитинги для полипропиленовых труб",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Шланги для душа",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сантехника",
      "3": "Экраны для ванн",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочные аппараты",
      "3": "Балластные реостаты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сварочное оборудование",
      "3": "Блоки управления сваркой",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Комплектующие для сварочных аппаратов",
      "3": "Блоки подачи проволоки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Комплектующие для сварочных аппаратов",
      "3": "Генераторы ацетиленовые",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сварочное оборудование",
      "3": "Защитные сварочные экраны и шторы",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Комплектующие для газосварки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Кожухи для плазменного резака",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Магнитные угольники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сварочное оборудование",
      "3": "Направляющие каналы для сварочной проволоки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сварочное оборудование",
      "3": "Обратные клапаны для газовых баллонов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Печи для сушки электродов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сварочное оборудование",
      "3": "Плазмотроны",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Подогреватели газа",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Расходные материалы и запчасти для полуавтоматов MIG/MAG",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Расходные материалы и запчасти для аргонодуговой TIG сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Расходные материалы и запчасти для плазматронов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Сварочные зажимы",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Сварочная химия",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Сварочные заземляющие клеммы",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Сопла для сварочных аппаратов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Сварочное оборудование",
      "3": "Цанги для сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Сварочное оборудование",
      "3": "Штекеры, гнезда для сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Светосигнальная и управляющая арматура",
      "3": "Кнопки управления",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы безопасности",
      "3": "Аварийное строительное ограждение",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы безопасности",
      "3": "Средства опломбирования и опечатывания",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы видеонаблюдения",
      "3": "Декодеры",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы контроля и управления доступом",
      "3": "Комплектующие для шлагбаумов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы контроля и управления доступом",
      "3": "Охранные дымогенераторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Автоматика для вентиляции",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Аксессуары для конвекторов и тепловых пушек",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Аксессуары для обогревателей и вентиляторов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Аксессуары для счетчиков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Биокамины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Биотопливо для биокаминов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Вентиляторы вытяжные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Вентиляционные установки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Вентиляционные хомуты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Водяные тепловентиляторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Встраиваемые конвекторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Газовые баллоны",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Газовые конвекторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Газовые обогреватели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Горелки для котлов отопления",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Дымоходы для систем отопления",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Каменный уголь",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Канальные нагреватели и охладители",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Колосники для котлов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Комплектующие для дымоходов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Комплектующие для котельных и тепловых пунктов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Комплектующие к тёплому полу",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Наборы и аксессуары для каминов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Напольные водяные конвекторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Печи и камины для дома",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Порталы для каминов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Радиаторы отопления",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Расширительные баки для отопления",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Расходомеры",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Решетки вентиляционные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Системы управления для котлов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Соединители воздуховодов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Солнечные коллекторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Счетчики газа",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Тепловые пушки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Теплоноситель для систем отопления",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Теплосчетчики",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Терморегуляторы для теплого пола и систем отопления",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Химия для систем отопления",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Шкафные газорегуляторные пункты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Экраны для радиаторов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Электрический теплый пол",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Электрокамины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Электроприводы для регулирующих клапанов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Каски и шлемы строительные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Кронштейны для огнетушителей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Маски и очки для сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Мембраны для расширительных баков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Наколенники строительные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Пасты и крема для очистки рук от сильных загрязнений",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Системы отопления и вентиляции",
      "3": "Пластинчатые теплообменники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Рабочие перчатки и краги",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Респираторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Щитки и очки защитные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Средства защиты органов слуха",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Страховочные пояса",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Средства индивидуальной защиты",
      "3": "Фильтры и аксессуары для средств защиты органов дыхания",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Вакуум-формовочные машины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Вальцы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Газорезательные машины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Гильотины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Зиговочные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Кромкооблицовочные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Кузнечные станки для холодной ковки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Листогибы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Разматыватели металла",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Станки для сетки-рабицы",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Станочное оборудование",
      "3": "Станки для гибки арматуры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Станки для перемотки кабеля",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Станочное оборудование",
      "3": "Станки для разделки кабеля",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Станочное оборудование",
      "3": "Станки для резки арматуры",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Станочное оборудование",
      "3": "Станки для производства сплитерных блоков",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Станочное оборудование",
      "3": "Станки правильно-вытяжные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Угловысечные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Станочное оборудование",
      "3": "Фальцеосадочные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Аппараты для плазменной резки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Аппараты для сварки пластика и синтетических материалов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Аппараты для сварки пластиковых труб",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Аппараты для точечной сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Бетономешалки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Блоки охлаждения для сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Блок-контейнеры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Весы строительные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Вибрационные плиты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Виброрейки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Вибротрамбовки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Высоковакуумные насосы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Газовые баллоны для сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Газовые редукторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Газовые резаки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Газосварочные горелки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Гидравлическое оборудование",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Горелки для сварки TIG и MIG/MAG",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Грузоподъемное оборудование",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Держатели электродов",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительное оборудование",
      "3": "Дизель-генераторные установки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительное оборудование",
      "3": "Дробилки и измельчители для пластика",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Затирочные машины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Индукционные нагреватели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Информационные табло",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Командоконтроллеры",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительное оборудование",
      "3": "Комплектующие для вибрационных плит",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительное оборудование",
      "3": "Комплектующие для штукатурных станций",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Лазерные маркираторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Лазерные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Лазерные трубки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Оборудование для напыления пенополиуретана",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Окрасочные аппараты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Пескоструйные аппараты и пистолеты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Пистолеты для вязки арматуры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Принадлежности для станков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Проволока для сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Прутки для сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Сварочные аппараты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Сварочные аппараты для ВОЛС",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Сверлильные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Стеллажи для мастерской",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Строительные глубинные вибраторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Строительные пылесосы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Стружкоотсосы",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительное оборудование",
      "3": "Телескопические подъемники",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительное оборудование",
      "3": "Термоэлектрические маты ТЭМ",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Тележки и тачки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Токарные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Точильные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительное оборудование",
      "3": "Трансформаторы для прогрева бетона",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Фрезерные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Фуговальные и рейсмусовые станки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Чиллеры для лазерных станков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Шлифовальные станки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительное оборудование",
      "3": "Штукатурные станции",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Электродвигатели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Электроды для сварки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "SIP-панели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Арматура",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Бетон",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Водостоки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Гайки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Гвозди",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Герметики",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Гибкая черепица",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Гидроизоляционные ленты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Гипсокартон",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Готовые проекты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Грунтовка",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Доска террасная",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Доски строительные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Древесноволокнистые плиты (ДВП, МДФ, ХДФ)",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "ДСП",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Железобетонные и полимерные изделия",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Жидкий бетон",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Звукоизоляционные материалы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Изоляционные пленки",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительные материалы",
      "3": "Капролон",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Кладочные смеси и клеи специального назначения",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Клеи бытовые и универсальные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Клей для обоев",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Клей для плитки, камня и блоков",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительные материалы",
      "3": "Комплектующие для опалубки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "ЛДСП панели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Лента ФУМ",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Магнитные крепления",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Мастики",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Металлочерепица",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Минеральная вата",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Монтажная пена",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Напыляемый утеплитель",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Ондулин",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Оргстекло и акриловое стекло",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "ОСП",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Пасты полировальные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Пенопласт и пенополистирол",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Песок строительный",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Поликарбонат и комплектующие",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Строительные материалы",
      "3": "Полиуретан",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Профили для гипсокартона",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Профильные трубы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Профнастил",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительное оборудование",
      "3": "Пульты для крана, тельфера и тали",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Сайдинг",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Сетки строительные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Сетки, серпянки и ленты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Строительная химия",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Строительные блоки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Строительные затирки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Строительный скотч",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Стяжки и наливные полы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Сыпучие материалы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Такелаж",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Трубы стальные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Уголки металлические",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Фанера",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Фасадные панели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Цемент",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Чердачные лестницы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Швеллер металлический",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Шпатлевочные смеси",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Штукатурки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Шурупы и саморезы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Щебень, гравий, керамзит",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные материалы",
      "3": "Элементы лестниц",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные смеси",
      "3": "Гидроизоляционные смеси",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительные смеси",
      "3": "Формы для образцов бетона",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительный крепеж",
      "3": "Винты и болты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительный крепеж",
      "3": "Дюбели и дюбель-гвозди",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительный крепеж",
      "3": "Заклепки строительные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительный крепеж",
      "3": "Кляймеры",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительный крепеж",
      "3": "Перфорированные уголки, ленты и пластины",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительный крепеж",
      "3": "Пломбы для опечатывания",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Строительный крепеж",
      "3": "Строительные шпильки, штифты и шплинты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Теплый пол и аксессуары",
      "3": "Греющий кабель и комплектующие",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Теплый пол и аксессуары",
      "3": "Трубы для водяного теплого пола",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Устройства электропитания и электростанции",
      "3": "Аккумуляторы для солнечных панелей",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Устройства электропитания и электростанции",
      "3": "Блоки автозапуска для генераторов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Устройства электропитания и электростанции",
      "3": "Ветрогенераторы для дома",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Устройства электропитания и электростанции",
      "3": "Комплектующие для электрогенераторов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Устройства электропитания и электростанции",
      "3": "Лабораторные блоки питания",
      "percent": "8%"
    },
    {
      "1": "Строительство, ремонт",
      "2": "Устройства электропитания и электростанции",
      "3": "Частотные преобразователи",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Фильтры для воды и комплектующие",
      "3": "Картриджи для бытовых водоочистителей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Фильтры для воды и комплектующие",
      "3": "Фильтрующие материалы для систем водоочистки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "DIN-рейки и комплектующие",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Автоматические выключатели дифференциального тока",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Автоматические выключатели и рубильники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Аксессуары для кабельных лотков",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Антикражные рамки для магазинов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Арматура для СИП",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Выключатели",
      "percent": "10%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Гофрированные трубы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Держатели предохранителей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Изолента",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Инверторы для солнечных панелей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Инструменты для работы с кабелем",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Кабели и провода для строительства",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Кабель-каналы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Кабельные протяжки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Кабельные розетки и вилки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Кабельные стяжки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Клеммы изолирующие",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Комплектующие для кабель-каналов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Коннекторы оптические",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Контакторы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Контроллеры для солнечных батарей",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Лотки для кабеля",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Наконечники изолирующие",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Оптический кабель",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Патч-корды оптические",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Переходники, вилки и тройники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Подрозетники",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Рамки для выключателей и розеток",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Распределительные коробки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Расцепители и реле дистанционного отключения",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Реле",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Розетки",
      "percent": "10%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Сетевые фильтры и удлинители",
      "percent": "5%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Сигнальные индикаторные лампы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Соединительные изолирующие зажимы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Солнечные панели",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Счетчики электроэнергии",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Термоусадочные трубки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Трубы электромонтажные",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Турникеты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Электрические щиты",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Электропредохранители",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрика",
      "3": "Энергетические стойки",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрические щиты и комплектующие",
      "3": "Комплектующие для щитов",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электрические щиты и комплектующие",
      "3": "Шины и шинопроводы",
      "percent": "8%"
    },
    {
      "1": "Строительство и ремонт",
      "2": "Электро- и бензопилы",
      "3": "Торцовочные пилы",
      "percent": "8%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "DJ контроллеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Аксессуары для виниловых проигрывателей",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Аксессуары для микрофонов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Акустические системы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Акустические стойки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Аккумуляторы для портативных колонок",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Амбушюры для наушников",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Аудио кабели и переходники",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Аудиоусилители и ресиверы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Видеосендеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Виниловые проигрыватели",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Вращающиеся головы и сканеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Диктофоны и портативные рекордеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Директ-боксы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Караоке-системы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Компьютерные колонки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Кронштейны для акустики",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Кроссоверы для звука",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Микрофонные стойки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Микрофоны",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Микшерные пульты",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Музыкальные центры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Наушники и гарнитуры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Подставки для наушников",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Портативные колонки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Радиоприемники",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Саундбары и комплекты акустики",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Умные колонки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Фонокорректоры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Цифровые плееры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Чехлы для наушников",
      "percent": "15%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Аудиотехника",
      "3": "Чехлы для плееров и аудиосистем",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Аксессуары для видеотехники",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Видеокабели и переходники",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Видеомикшеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Домашние кинотеатры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Интерактивные доски",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Интерактивные панели",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Крепления для проекторов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Кронштейны для ТВ",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Лампы для проекторов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Медиаплееры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Проекторы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Проекционные экраны",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Пульты для телевизоров и тв-приставок",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Телевизионные антенны",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Рамки для телевизоров",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Светодиодные экраны",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Спутниковое ТВ",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Сумки и чехлы для проекторов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Оборудование для видеомонтажа и цветокоррекции",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Чехлы для пультов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Аксессуары для дронов и квадрокоптеров",
      "percent": "10%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Аксессуары для игровых приставок",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Аксессуары для очков виртуальной реальности",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Видеоигры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Дроны и квадрокоптеры",
      "percent": "10%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Игровые контроллеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Игровые приставки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Карты оплаты для игр",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Очки виртуальной реальности",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Развлечения",
      "3": "Очки дополненной реальности",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Световое оборудование",
      "3": "LED стробоскопы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Световое оборудование",
      "3": "LED эффекты",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Световое оборудование",
      "3": "Лазерные эффекты",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Световое оборудование",
      "3": "Прожекторы LED PAR",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Световое оборудование",
      "3": "Пульты и контроллеры светового оборудования",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Спецэффекты и шоу-техника",
      "3": "Генераторы спецэффектов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Спецэффекты и шоу-техника",
      "3": "Жидкости для генераторов эффектов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Спецэффекты и шоу-техника",
      "3": "Конфетти машины",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Спецэффекты и шоу-техника",
      "3": "Сценические вентиляторы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Телевизоры",
      "3": "Телевизоры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Видеотехника",
      "3": "Телесуфлеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Аккумуляторы и зарядные устройства для фото- и видеокамер",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Аксессуары для стедикамов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Аксессуары для экшн камер",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Батарейки и аккумуляторы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Бленды",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Видеокамеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Видеокассеты для видеокамер",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Защитные пленки и стекла для фото- и видеокамер",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Импульсный свет",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Кейсы для аккумуляторов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Кольцевые лампы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Конвертеры для объективов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Накамерные мониторы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Объективы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Отражатели",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Переходники для объективов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Поворотные столы для 3D съемки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Постоянный свет",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Портативные видеорегистраторы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Пульты ДУ для фотоаппаратов",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Радиосинхронизаторы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Ручные стабилизаторы и стедикамы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Светофильтры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Слайдеры для видеосъемки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Софтбоксы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Стойки для освещения",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Сумки и чехлы для фото- и видеокамер",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Фоновые системы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Фотовспышки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Фотокамеры",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Фотокамеры моментальной печати",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Фотопленки",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Фотофоны",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Штативы",
      "percent": "5%"
    },
    {
      "1": "ТВ, Аудио, Видео",
      "2": "Фото- и видеокамеры",
      "3": "Экшн-камеры",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Аккумуляторы для телефонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Вакуумные сепараторы",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Внешние аккумуляторы",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Держатели для телефонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Дисплеи для смартфонов ",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Зарядные устройства",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Защитные пленки и стекла для смартфонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Кабели и переходники для смартфонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Наклейки для телефонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Системы охлаждения для смартфонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Смарт-линзы для смартфонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Увеличительные экраны для смартфонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Аксессуары для телефонов",
      "3": "Чехлы для смартфонов",
      "percent": "15%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Bluetooth-трекеры",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Аксессуары для раций и радиостанций",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Аксессуары для систем нагревания",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Жидкости для электронных сигарет",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Зарядные устройства для смарт-часов и фитнес-браслетов",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Рации и радиостанции",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Ремешки для смарт-часов и фитнес-браслетов",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Системы нагревания",
      "percent": "10%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Смарт-кольца",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Смарт-часы",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Фитнес-браслеты",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Чехлы для смарт-часов и фитнес-браслетов",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Чехлы для электронных книг",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Электронные книги",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Гаджеты",
      "3": "Электронные сигареты",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Мобильные телефоны",
      "3": "Мобильные телефоны",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Радиотелефоны",
      "3": "Радиотелефоны",
      "percent": "5%"
    },
    {
      "1": "Телефоны и гаджеты",
      "2": "Смартфоны",
      "3": "Смартфоны",
      "percent": "5%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для ванной и туалета",
      "3": "Держатели и крючки для ванной",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для ванной и туалета",
      "3": "Ершики туалетные",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для ванной и туалета",
      "3": "Карнизы для ванной",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для ванной и туалета",
      "3": "Ковши для ванной",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для ванной и туалета",
      "3": "Мыльницы и стаканы для ванной",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для ванной и туалета",
      "3": "Полки и стойки для ванной",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для ванной и туалета",
      "3": "Чехлы на сиденье для унитаза",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для ванной и туалета",
      "3": "Шторы для ванной",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для полива",
      "3": "Системы капельного полива",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для полива",
      "3": "Фитинги для поливочных шлангов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Аксессуары для полива",
      "3": "Клапанные боксы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Барные принадлежности",
      "3": "Принадлежности для приготовления алкоголя",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Бытовая химия",
      "3": "Нейтрализаторы запахов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Аксессуары для бани и сауны",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Аксессуары для грилей и мангалов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Аксессуары для моек высокого давления",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Аксессуары для садовых шатров и зонтов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Аксессуары для сборных и надувных бассейнов",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Банные печи",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Бассейны",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Биотуалеты",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Вертикуттеры и аэраторы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Водяные насосы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Воздуходувки и садовые пылесосы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Газонокосилки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Готовые садовые конструкции",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Грили и коптильни",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Грунты и субстраты",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Грядки, клумбы и ограждения для сада",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Двигатели для садовой техники",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Дровоколы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Дымоходы для бани",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Зернодробилки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Зонты от солнца",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Измельчители садового мусора",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Измельчители сена, соломы и корнеплодов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Инструменты для обработки почвы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Катушки и тележки для шлангов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Комплекты садовой мебели",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Круги и матрасы для плавания",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Культиваторы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Кусторезы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Лежаки и шезлонги",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Лестницы для бассейнов",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Мангалы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Маркизы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Мини-тракторы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Мойки высокого давления",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Мотоблоки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Мотопомпы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Наборы для выращивания растений",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Навесное оборудование для садовой техники",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Насосы для надувных товаров",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Ножи и насадки для газонокосилок",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Отпугиватели для птиц, собак и грызунов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Очаги для костра",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Парогенераторы для саун и бань",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Печи для казанов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Пистолеты, насадки, дождеватели для шлангов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Подметальные и поломоечные машины",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Проращиватели семян и микрофермы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Противогололедные реагенты и материалы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Пылесосы для бассейнов",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Решетки для гриля",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые газоны",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые гамаки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые диваны",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые дорожки и покрытия",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые души",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые качели",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые компостеры",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые кресла и стулья",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые лейки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые ножницы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые опрыскиватели",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые пруды",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые скамейки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые столы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые умывальники",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые фигуры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Садовые шатры",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Семена овощей",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Семена цветов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Сенокосилки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Системы управления поливом",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Снегоуборочные лопаты",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Снегоуборочные машины",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Средства для розжига",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Сауны",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Средства от грызунов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Тандыры",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Тенты для бассейнов",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Теплицы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Триммеры для газона",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Удобрения для растений",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Укрывной материал для огорода",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Фильтры для бассейнов",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Фитобочки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Химические средства защиты растений",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Химия для бассейнов и водоемов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Шампуры",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Шланги для полива",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Шпалеры и опоры для растений",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Дача, сад и огород",
      "3": "Электрогенераторы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Декоративные подушки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Комплекты постельного белья",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Корпе",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Крепеж для постельного белья",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Наволочки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Наматрасники",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Одеяла",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Перчатки и прихватки для кухни",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Пледы и покрывала",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Пододеяльники",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Подушки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Полотенца",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Простыни",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Скатерти и сервировочные коврики",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Фартуки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Чехлы и накидки для мебели",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Домашний текстиль",
      "3": "Электроодеяла",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Сельхозтехника",
      "3": "Запасные части для сельхозтехники",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Инвентарь для уборки",
      "3": "Аксессуары для швабр",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Инвентарь для уборки",
      "3": "Роторные машины",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Инвентарь для уборки",
      "3": "Тележки для уборки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Ароматы для дома",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Вазы для цветов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Горшки и подставки для цветов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Декоративный мох",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Жалюзи",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Зеркала интерьерные",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Интерьерные глобусы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Интерьерные наклейки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Искусственные растения",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Карнизы для штор",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Картины и постеры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Ключницы настенные",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Коврики для ванной",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Ковровые дорожки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Ковры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Колокольчики декоративные",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Комнатные растения",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Копилки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Медальницы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Муляжи книг",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Напольные часы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Настенные часы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Настольные часы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Пепельницы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Подсвечники и канделябры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Рамки для картин",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Свечи для дома",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Статуэтки и фигурки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Фоторамки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Художественные витражи",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Ширмы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Шкатулки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Интерьер",
      "3": "Шторы и тюли",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Камеры видеонаблюдения и комплектующие",
      "3": "Муляжи камер видеонаблюдения",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Картины, панно и рамки",
      "3": "Крепление и фурнитура для картин",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Ковры и ковровые дорожки",
      "3": "Аксессуары для ковров",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Ковры и ковровые дорожки",
      "3": "Чехлы для ковров",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Комплектующие и аксессуары для садовой техники",
      "3": "Прочая оснастка к садовой технике",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Кофемолки и турки",
      "3": "Кофемолки ручные",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Кружки, стаканы и бокалы",
      "3": "Подстаканники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Кухонные принадлежности",
      "3": "Диспенсеры для кухни",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Кухонные принадлежности",
      "3": "Механические сушилки для овощей и фруктов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Кухонные принадлежности",
      "3": "Принадлежности для изготовления колбас",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Кухонные принадлежности",
      "3": "Принадлежности для суши",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Кухонные принадлежности",
      "3": "Рефрактометры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Кухонные принадлежности",
      "3": "Ступки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Оборудование для дезинфекции",
      "3": "Генераторы холодного тумана",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Аварийные светильники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Бра",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Взрывозащищенные светильники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Встраиваемые светильники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Комплектующие для светильников",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Комплектующие для трек-систем и спотов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Контроллеры для светодиодов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Лампочки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Люстры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Наклейки к светильникам аварийного освещения",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Настенно-потолочные светильники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Настольные и напольные лампы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Ночники и декоративные светильники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Патроны для лампочек и ламподержатели",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Переносные светильники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Плафоны для светильников",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Прожекторы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Светодиодные ленты",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Споты и трек-системы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Уличное освещение",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Освещение",
      "3": "Фитосветильники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Оформление интерьера",
      "3": "Декоративная посуда",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Оформление интерьера",
      "3": "Таблички для дома",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Парфюмерия для дома",
      "3": "Аксессуары для аромаламп и ароматических диффузоров",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Парфюмерия для дома",
      "3": "Аромалампы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Парфюмерия для дома",
      "3": "Ароматические диффузоры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Парфюмерия для дома",
      "3": "Аппараты для ароматизации помещений",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Парфюмерия для дома",
      "3": "Благовония",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда для приготовления пищи",
      "3": "Мармиты",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда для приготовления пищи",
      "3": "Принадлежности для приготовления сыра",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда для хранения продуктов",
      "3": "Крышки для баков и бочек",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Аксессуары для готовки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Аксессуары для приготовления напитков",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Блюда и салатники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Бокалы и стаканы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Бочки, кадки, жбаны для продуктов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Бутылки для напитков",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Дуршлаги и миски",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Емкости для хранения продуктов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Заварочные чайники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Казаны",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Кастрюли и ковши",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Кондитерские аксессуары",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Консервные ножи и закаточные машинки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Контейнеры и ланч-боксы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Кружки, блюдца и пары",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Крышки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Кувшины и декантеры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Кухонные инструменты",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Лапшерезки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Мельницы",
      "percent": "5%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Мерные емкости и сита",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Мясорубки ручные",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Наборы для фондю",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Наборы посуды для готовки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Ножи и наборы ножей",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Овощерезки и терки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Овощечистки и рыбочистки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Одноразовая посуда",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Одноразовые столовые приборы (не использовать)",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Пиалы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Подносы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Подставки и держатели для посуды",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Посуда и формы для выпечки и запекания",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Предметы сервировки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Принадлежности для бутылок",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Разделочные доски",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Рейлинги, крючки и полки для кухни",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Ручные соковыжималки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Рюмки и стопки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Сервизы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Скалки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Сковороды",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Сменные картриджи для водяных фильтров",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Солонки и емкости для специй",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Столовые приборы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Сушилки для посуды",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Тарелки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Точилки для ножей",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Турки для кофе",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Фильтры-кувшины для воды",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Фольга, бумага и пакеты для кухни",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Формовщики для котлет",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Формы для льда, шоколада и десертов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Френч-прессы и кофейники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Хлебницы и корзины для хлеба",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Чайники и самовары",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Посуда и принадлежности",
      "3": "Штопоры и открывалки для бутылок",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Растения, вазы и горшки",
      "3": "Аксессуары для рассады",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Растения, деревья, вазы и горшки",
      "3": "Декоративные наполнители",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая мебель",
      "3": "Беседки и топчаны",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая мебель",
      "3": "Подвесные кресла",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая техника",
      "3": "Воздушные фильтры для двигателей садовой техники",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая техника",
      "3": "Лески и ножи для триммеров",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая техника",
      "3": "Мотобуксировщики",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая техника",
      "3": "Ремни для снегоуборщиков",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая техника",
      "3": "Ремни и пояса для триммеров",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая техника",
      "3": "Травосборники для газонокосилок",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовая техника",
      "3": "Электротяпки и прополочные машинки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовые инструменты",
      "3": "Аксессуары для канистр",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовые инструменты",
      "3": "Аксессуары для садовых работ",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовые инструменты",
      "3": "Комплектующие для садовых опрыскивателей",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовые инструменты",
      "3": "Сеялки для семян",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовые инструменты",
      "3": "Садовые пилы, ножовки и ножи",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовые инструменты",
      "3": "Черенки и ручки для садового инвентаря",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовый декор",
      "3": "Аксессуары для прудов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовый декор",
      "3": "Фильтры и аэраторы для фонтанов и прудов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовый декор",
      "3": "Фотозаборы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Садовый декор",
      "3": "Флюгеры",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Сельхозтехника",
      "3": "Запчасти для тракторов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Сельхозтехника",
      "3": "Навесное оборудование для мотоблоков и культиваторов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Семена, удобрения и грунты",
      "3": "Луковичные растения",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Семена, удобрения и грунты",
      "3": "Саженцы лиственных деревьев",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Семена, удобрения и грунты",
      "3": "Саженцы цветов, плодовых деревьев и кустарников",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Семена, удобрения и грунты",
      "3": "Семена деревьев и кустарников",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Семена, удобрения и грунты",
      "3": "Семена полевых культур",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Семена, удобрения и грунты",
      "3": "Семена пряных трав и салатов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Сервировка стола",
      "3": "Креманки и розетки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Сервировка стола",
      "3": "Масленки, сырницы и лимонницы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Сервировка стола",
      "3": "Менажницы, конфетницы и тортницы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Сервировка стола",
      "3": "Сахарницы и молочники",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Автоматика для ворот",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Блоки питания для домофонов и замков",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Видеорегистраторы систем видеонаблюдения",
      "percent": "5%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Датчики утечки газа",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Домофоны и комплектующие",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Извещатели охранные",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Извещатели пожарные",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Камеры видеонаблюдения",
      "percent": "5%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Комплектующие для систем видеонаблюдения",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Контроль доступа",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Кронштейны для камер видеонаблюдения",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Металлодетекторы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Огнетушители",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Приемно-контрольные приборы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Сейфы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Системы охранно-пожарной сигнализации",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Системы безопасности",
      "3": "Считыватели систем контроля доступа",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "СКУД",
      "3": "Контроллеры СКУД",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Текстиль для кухни",
      "3": "Прихватки, рукавицы и комплекты",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Теплицы и аксессуары",
      "3": "Аксессуары для теплиц и парников",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Теплицы и аксессуары",
      "3": "Термоприводы для теплиц",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Товары для бани и сауны",
      "3": "Газовые горелки для банных печей",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Товары для бани и сауны",
      "3": "Двери для бани и сауны",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Товары для бани и сауны",
      "3": "Камни для печей",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Товары для бани и сауны",
      "3": "Окна для бани",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Товары для бани и сауны",
      "3": "Пульты управления для электрических печей",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Умный дом",
      "3": "Датчики для умного дома",
      "percent": "5%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Умный дом",
      "3": "Комплекты умного дома",
      "percent": "5%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Умный дом",
      "3": "Шлюзы умного дома",
      "percent": "5%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Уход за обувью",
      "3": "Защитные аксессуары для обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Уход за обувью",
      "3": "Колодки и формодержатели для обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Уход за одеждой",
      "3": "Насадки к машинкам для удаления катышков",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Уход за одеждой",
      "3": "Средства для ухода за одеждой",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Аксессуары для ванной",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Аксессуары для кухонных моек",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Аксессуары для стирки белья",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Бумажные салфетки и платочки",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Ведра и тазы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Веники и метлы",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Веревки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Вешалки-плечики для одежды",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Влажные салфетки",
      "percent": "7%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Гели и жидкие средства для стирки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Гладильные доски",
      "percent": "5%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Диспенсеры для ванной и туалета",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Жидкости и наполнители для биотуалетов",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Запчасти и комплектующие для зажигалок",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Зажигалки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Зубочистки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Капсулы и пластины для стирки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Кондиционеры и ополаскиватели для белья",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Корзины для белья",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Коробки, ящики и корзины для хранения",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Машинки для удаления катышков",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Машинки для чистки обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Мешки для мусора",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Моющие средства для мебели, ковров и напольных покрытий",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Моющие средства для посуды",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Мусорные баки и урны",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Мусорные ведра",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Наборы бытовой химии",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Органайзеры и кофры для одежды и обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Освежители воздуха",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Отбеливатели и пятновыводители",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Полкодержатели",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Прищепки для белья",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Совки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Средства для глажения и антистатики",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Средства для мытья пола и стен",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Средства для мытья стекол",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Средства для посудомоечных машин",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Средства для ухода за бытовой техникой",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Средства для чистки кухонных поверхностей",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Средства против насекомых",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Стекломои, скребки, сгоны",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Стельки и утеплители для обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Стиральные порошки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Столовые бумажные салфетки и полотенца",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Сундуки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Сушилки для белья",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Сушилки для обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Тряпки и губки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Туалетная бумага",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Туалетное и жидкое мыло",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Универсальные чистящие средства",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Упаковочные материалы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Упаковочное оборудование",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Устройства для перемещения мебели",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Хозяйственные сумки",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Чехлы для гладильных досок",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Чехлы для одежды и обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Чистящие принадлежности для компьютерной техники",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Чистящие средства для обуви",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Чистящие средства для сантехники, кафеля и труб",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Швабры и насадки",
      "percent": "8%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Шнурки для обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Щетки и ложки для обуви",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Хозяйственные товары",
      "3": "Щетки, ролики для чистки одежды",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Шторы и карнизы",
      "3": "Люверсы для штор",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Шторы и карнизы",
      "3": "Рулонные шторы",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Шторы и карнизы",
      "3": "Фурнитура для карнизов",
      "percent": "10%"
    },
    {
      "1": "Товары для дома и дачи",
      "2": "Шторы и карнизы",
      "3": "Шторная лента",
      "percent": "10%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "GPS-трекеры для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Адресники и брелки на ошейник",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Дверцы и перегородки для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Дополнительные элементы для дверей и клеток",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Коврики для мисок и лотков",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Лежаки и домики для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Лестницы для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Миски и поилки для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Обувь для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Одежда для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Переноски для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Аксессуары для животных",
      "3": "Шлейки и ошейники для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Ветаптека",
      "3": "Антипаразитарные средства для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Ветаптека",
      "3": "Ветеринарные препараты",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Ветаптека",
      "3": "Витамины и добавки для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Ветаптека",
      "3": "Воротники для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Ветаптека",
      "3": "Ветеринарные паспорта",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Ветаптека",
      "3": "Послеоперационные попоны для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Ветаптека",
      "3": "Чипы и сканеры для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Ветаптека",
      "3": "Шприцы ветеринарные",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Зубные щетки для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Лапомойки для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Отучающие средства для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Пакеты гигиенические для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Парфюмерия для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Пеленки для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Подгузники для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Средства по уходу за животными",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Сыворотки и масла для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Устранители запахов животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена и уход за животными",
      "3": "Шампуни и кондиционеры для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Гигиена сельскохозяйственных животных",
      "3": "Инструменты для обработки копыт",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Груминг",
      "3": "Когтерезы и пилки для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Груминг",
      "3": "Машинки для стрижки животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Груминг",
      "3": "Ножницы для стрижки животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Груминг",
      "3": "Оборудование для груминга",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Груминг",
      "3": "Фены для животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Груминг",
      "3": "Фурминаторы, расчески, пуходерки",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для грызунов",
      "3": "Игрушки для грызунов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для грызунов",
      "3": "Клетки и домики для грызунов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для грызунов",
      "3": "Корма для грызунов",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для грызунов",
      "3": "Лакомства для грызунов",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Влажные корма для кошек",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Игрушки для кошек",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Когтеточки для кошек",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Лакомства для кошек",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Лежаки и домики не активна",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Лотки для кошек",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Наполнители для кошачьего туалета",
      "percent": "10%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Переноски не активна",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Совки для лотка",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для кошек",
      "3": "Сухие корма для кошек",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для птиц",
      "3": "Аксессуары для клеток",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для птиц",
      "3": "Брудеры для птиц",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для птиц",
      "3": "Игрушки для птиц",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для птиц",
      "3": "Клетки и домики для птиц",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для птиц",
      "3": "Корма для птиц",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для птиц",
      "3": "Лакомства для птиц",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Аквариумная химия",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Аквариумы",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Аэрация и озонирование аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Грунты для аквариумов и террариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Декорации для аквариумов и террариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Измерительные приборы для аквариумов и террариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Компрессоры для аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Корма для рыб и рептилий",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Кормушки для рыб и рептилий",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Наполнители для аквариумных фильтров",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Освещение для аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Помпы для аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Сачки для аквариума",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Сифоны для аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Стеклоочистители и скребки для аквариума",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Стерилизация аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Терморегуляция для аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Террариумы",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Фильтры для аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Фоны для аквариумов и террариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для рыб и рептилий",
      "3": "Шланги и трубки для аквариума",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Агронавигаторы и курсоуказатели",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Биоконсерванты",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Влагомеры и измерители температуры зерна",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Декристаллизаторы",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Доильные аппараты",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Запчасти и комплектующие для доильных аппаратов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Инкубаторы для яиц",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Комбикорма для сельскохозяйственных животных",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Комбикормовое оборудование",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Маркировка животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Материалы для заготовки сенажа и силоса",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Миски и поилки для сельскохозяйственных животных",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Моющие средства для фермерского оборудования",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Перощипальные машины",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Размораживатели молозива",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Сепараторы",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Станки для сельскохозяйственных животных",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Стригальные машины, запчасти",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Уход за сельскохозяйственными животными",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для сельскохозяйственных животных",
      "3": "Электропастухи и комплектующие",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для собак",
      "3": "Влажные корма для собак",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для собак",
      "3": "Вольеры и будки",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для собак",
      "3": "Игрушки для собак",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для собак",
      "3": "Лакомства для собак",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Для собак",
      "3": "Миски и поилки",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для собак",
      "3": "Намордники для собак",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для собак",
      "3": "Поводки для собак",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Для собак",
      "3": "Сухие корма для собак",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Оборудование для аквариумов и террариумов",
      "3": "Запчасти для аквариумного оборудования",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Инвентарь для обслуживания аквариумов и террариумов",
      "3": "Прочий инвентарь для аквариумов",
      "percent": "11%"
    },
    {
      "1": "Товары для животных",
      "2": "Товары для пчеловодства",
      "3": "Разделительные решетки для ульев",
      "percent": "7%"
    },
    {
      "1": "Товары для животных",
      "2": "Товары для пчеловодства",
      "3": "Ручной инвентарь пчеловода",
      "percent": "7%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "-",
      "3": "Украшения и аксессуары",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Аксессуары для волос",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Аксессуары для спецодежды",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Брелоки и ключницы",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Галстуки и бабочки",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Головные уборы",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Зонты",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Комплекты аксессуаров",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Косметички и несессеры",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Кошельки",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Обложки для документов",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Перчатки и варежки",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Подставки и держатели для украшений",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Ремни",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Ремни для сумок",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Свадебные аксессуары",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Средства для чистки ювелирных изделий",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Сумки и рюкзаки",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Четки",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Аксессуары",
      "3": "Шарфы и платки",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Багаж",
      "3": "Дорожные аксессуары",
      "percent": "7%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Багаж",
      "3": "Дорожные сумки",
      "percent": "7%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Багаж",
      "3": "Чемоданы",
      "percent": "7%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Багаж",
      "3": "Чехлы для чемоданов",
      "percent": "7%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Браслеты бижутерные",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Броши бижутерные",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Запонки и зажимы бижутерные",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Колье бижутерные",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Кольца бижутерные",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Комплекты бижутерии",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Пирсинг бижутерный",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Подвески и шармы бижутерные",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Серьги бижутерные",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Бижутерия",
      "3": "Цепи и бусы бижутерные",
      "percent": "15%"
    },
    {
      "1": "Украшения",
      "2": "Бижутерия",
      "3": "Украшения для головы и лица",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Все категории",
      "3": "Портсигары и аксессуары для зажигалок",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Очки и аксессуары",
      "3": "Держатели для очков",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Очки и аксессуары",
      "3": "Солнцезащитные очки",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Очки и аксессуары",
      "3": "Уход за очками",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Очки и аксессуары",
      "3": "Футляры для очков",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Часы",
      "3": "Карманные часы",
      "percent": "7%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Часы",
      "3": "Ремешки и браслеты для часов",
      "percent": "7%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Часы",
      "3": "Часы наручные",
      "percent": "7%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Часы",
      "3": "Ювелирные часы",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирное оборудование и инструменты",
      "3": "Растяжки и уменьшители",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирное оборудование, подставки и фурнитура",
      "3": "Ювелирные весы",
      "percent": "11%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Браслеты",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Броши",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Запонки и зажимы",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Колье",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Кольца",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Комплекты ювелирных украшений",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Пирсинг",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Подвески",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Посуда и сувениры из драгоценных металлов",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Серьги",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Цепи",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Шармы",
      "percent": "15%"
    },
    {
      "1": "Украшения и аксессуары",
      "2": "Ювелирные украшения",
      "3": "Ювелирные изделия для волос",
      "percent": "15%"
    }
  ]
}
export const cityListConstants: City[] = [
  {id: 511010000, cityRus: 'Шымкент'},
  {id: 750000000, cityRus: 'Алматы'},
  {id: 710000000, cityRus: 'Астана'},
  {id: 471010000, cityRus: 'Актау'},
  {id: 151010000, cityRus: 'Актобе'},
  {id: 511610000, cityRus: 'Арысь'},
  {id: 231010000, cityRus: 'Атырау'},
  {id: 351810000, cityRus: 'Жезказган'},
  {id: 351010000, cityRus: 'Караганда'},
  {id: 195220100, cityRus: 'Каскелен'},
  {id: 191610000, cityRus: 'Капшагай'},
  {id: 111010000, cityRus: 'Кокшетау'},
  {id: 391010000, cityRus: 'Костанай'},
  {id: 233620100, cityRus: 'Кульсары'},
  {id: 431010000, cityRus: 'Кызылорда'},
  {id: 551010000, cityRus: 'Павлодар'},
  {id: 591010000, cityRus: 'Петропавловск'},
  {id: 392410000, cityRus: 'Рудный'},
  {id: 352310000, cityRus: 'Сатпаев'},
  {id: 632810000, cityRus: 'Семей'},
  {id: 196220100, cityRus: 'Талгар'},
  {id: 191010000, cityRus: 'Талдыкорган'},
  {id: 311010000, cityRus: 'Тараз'},
  {id: 352410000, cityRus: 'Темиртау'},
  {id: 271010000, cityRus: 'Уральск'},
  {id: 631010000, cityRus: 'Усть-Каменогорск'},
  {id: 552210000, cityRus: 'Экибастуз'},
  {id: 194020100, cityRus: 'Есик'},
  {id: 512610000, cityRus: 'Туркестан'},
  {id: 117020100, cityRus: 'Щучинск'},
  {id: 471810000, cityRus: 'Жанаозен'},
  {id: 515420100, cityRus: 'Сарыагаш'},
  {id: 352810000, cityRus: 'Шахтинск'},
  {id: 117055900, cityRus: 'Шиели'},
  {id: 273620100, cityRus: 'Аксай'},
  {id: 514420100, cityRus: 'Жетысай'},
  {id: 351610000, cityRus: 'Балхаш'},
  {id: 512610000, cityRus: 'Аксу'},
  {id: 433220100, cityRus: 'Аральск'},
  {id: 473630100, cityRus: 'Байконыр'},
  {id: 473630100, cityRus: 'Бейнеу'},
  {id: 195620100, cityRus: 'Жаркент'},
  {id: 512610000, cityRus: 'Зайсан'},
  {id: 316220100, cityRus: 'Каратау'},
  {id: 612010000, cityRus: 'Кентау'},
  {id: 314851205, cityRus: 'Кордай'},
  {id: 392010000, cityRus: 'Лисаковск'},
  {id: 352210000, cityRus: 'Сарань'},
  {id: 111810000, cityRus: 'Степногорск'},
  {id: 192610000, cityRus: 'Текели'},
  {id: 616420100, cityRus: 'Шардара'},
  {id: 316621100, cityRus: 'Шу'},
  {id: 156420100, cityRus: 'Риддер'},
  {id: 634820100, cityRus: 'Алтай'},
  {id: 271035100, cityRus: 'Зачаганск'},
  {id: 153220100, cityRus: 'Алга'},
  {id: 156020100, cityRus: 'Хромтау'},
  {id: 391610000, cityRus: 'Аркалык'},
  {id: 395430100, cityRus: 'Тобыл'},
  {id: 554230100, cityRus: 'Железинка'},
  {id: 394420100, cityRus: 'Житикара'},
  {id: 116651100, cityRus: 'Косшы'},
  {id: 633420100, cityRus: 'Аягоз'},
  {id: 634030100, cityRus: 'Глубокое'},
  {id: 632210000, cityRus: 'Курчатов'},
  {id: 636820100, cityRus: 'Шемонаиха'},
  {id: 353220100, cityRus: 'Абай'},
  {id: 474630100, cityRus: 'Шетпе'},
  {id: 475220100, cityRus: 'Форт-Шевченко'},
  {id: 474239100, cityRus: 'Жетыбай'},
  {id: 474230100, cityRus: 'Курык'},
  {id: 113220100, cityRus: 'Акколь'},
  {id: 515820100, cityRus: 'Ленгер'},
  {id: 195020100, cityRus: 'Уштобе'},
  {id: 154820100, cityRus: 'Кандыагаш'},
  {id: 194230100, cityRus: 'Узынагаш'},
  {id: 515230100, cityRus: 'Аксукент'},
  {id: 194083100, cityRus: 'Шелек'},
  {id: 196630100, cityRus: 'Чунджа'},
  {id: 434030100, cityRus: 'Жанакорган'},
  {id: 434430100, cityRus: 'Айтеке-Би'},
  {id: 315430100, cityRus: 'Мерке'},
  {id: 353641300, cityRus: 'Ушарал'},
];

main()
