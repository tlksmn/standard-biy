import axios from "axios";
import React, {FormEvent, useEffect, useRef, useState} from "react";
import {createRoot} from "react-dom/client";

import {
  ActivateApiData,
  ActivationFormProps, ApiError, ApiRivalConfigResponseI,
  AppStateInterface, PriceListApiT, SellerInterface, SellerProps,
  SellersListProps
} from "./types";

const API_URL = 'http://localhost:3001'

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
      const data = await axios.request({
        url: `https://kaspi.kz/yml/offer-view/offers/${elem.product.sku}`,
        method: 'post',
        data: {
          cityId: elem.city.code,
          id: elem.product.sku,
          merchantUID: "",
          limit: 10,
          page: 0,
          sort: true
        },
        headers: {
          Referer: `https://kaspi.kz/shop/p/${Math.ceil(Math.random() * 100000)}-${elem.product.sku}/?c=${elem.city.code}`,
        },
      }).then(response => response.data as PriceListApiT & ApiError)
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
        }, 100)
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
      appState.isAvailable && appState.isActivated &&
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
          <div style={{'color': 'red'}}>Уже обновлено {dataCounter}</div>
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
    console.log(regExp.test(codeValue))
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
          setFetchState(false);
          setErrorState(true);
          setTimeout(() => {
            setErrorState(false);
          }, 4_000);
        })
    } else {
      setChanceCount((val)=> val+1)
      setErrorState(true);
      setFetchState(false);
    }
  }
  return <form onSubmit={onActivateFormSubmit}>
    <label htmlFor="activationCode">Код активации</label>
    <input id="activationCode" ref={activationCodeRef} type='text'/>
    <button className='button' disabled={fetchState || chanceCount>4}
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

function main() {
  const temp = document.createElement('div');
  temp.setAttribute('id', 'biy-root');
  const rootDiv = document.body.appendChild(temp)
  const reactRoot = createRoot(rootDiv)
  reactRoot.render(<App/>)
}

main()
