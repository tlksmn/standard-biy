import React, {FormEvent, useRef, useState} from "react";
import {createRoot} from "react-dom/client";
import {
  ActivateFormData,
  ActivationFormProps,
  AppStateInterface, SellerProps,
  SellersListProps
} from "./types";

function App() {
  const [appState, setAppState] = useState<AppStateInterface>({
    activationCode: '',
    isActivated: false,
    isAvailable: false
  });
  return <div id='app'>
    {!appState.isActivated && !appState.isAvailable ?
      <ActivatedForm state={appState} setState={setAppState}/> : null}
  </div>
}

function ActivatedForm(props: ActivationFormProps) {
  const inputForm = useRef<HTMLInputElement>(null);
  const formBody: ActivateFormData = {activatedCode: ''}
  const onActivateFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    formBody.activatedCode = inputForm.current?.value || '';
  }
  return <form onSubmit={onActivateFormSubmit}>
    <label htmlFor="formInput">Код активации</label>
    <input id="formInput" type='text' ref={inputForm}/>
    <button type="submit">Активировать</button>
  </form>
}

function SellersList(props: SellersListProps) {
  return <div className="seller-list-container">
    {props.sellers.map(e => <div>
      <SellerComponent seller={e}/>
    </div>)}
  </div>
}

function SellerComponent(props: SellerProps) {
  return <div>
    <div>{props.seller.username}</div>
    <div>{props.seller.sysId}</div>
  </div>
}

function main() {
  const temp = document.createElement('div');
  temp.setAttribute('id', 'biy-root');
  const rootDiv = document.body.appendChild(temp)
  const reactRoot = createRoot(rootDiv)
  reactRoot.render(<App/>)
}

main()
