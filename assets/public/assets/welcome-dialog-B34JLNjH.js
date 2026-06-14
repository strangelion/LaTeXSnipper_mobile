import{n as e,r as t,t as n}from"./index-DhcdWJTt.js";async function r(){return localStorage.getItem(`ls_has_launched`)?t(e(n.MANIFESTS,[])):new Promise(e=>{let t=document.createElement(`div`);t.className=`modal-overlay welcome-overlay`,t.innerHTML=`
      <div class="welcome-dialog">
        <div class="welcome-icon">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
            <rect x="6" y="6" width="36" height="36" rx="8"/>
            <path d="M16 18h16M16 24h12M16 30h8"/>
          </svg>
        </div>
        <h2>欢迎使用 LaTeXSnipper</h2>
        <p class="welcome-desc">本应用需要 OCR 模型才能使用本地识别功能。</p>
        <p class="welcome-desc">模型不内置在应用中，您可以：</p>
        <ul class="welcome-list">
          <li>从官方源下载推荐模型</li>
          <li>导入自己的模型包</li>
          <li>稍后在设置中管理</li>
        </ul>
        <div class="welcome-actions">
          <button class="welcome-btn primary" id="welcome-download">立即下载</button>
          <button class="welcome-btn secondary" id="welcome-external">使用外部API</button>
          <button class="welcome-btn ghost" id="welcome-skip">稍后设置</button>
        </div>
      </div>
    `,document.body.appendChild(t),t.querySelector(`#welcome-download`).addEventListener(`click`,()=>{t.remove(),localStorage.setItem(`ls_has_launched`,`1`),document.querySelector(`[data-tab="settings"]`)?.click(),e(!1)}),t.querySelector(`#welcome-external`).addEventListener(`click`,()=>{t.remove(),localStorage.setItem(`ls_has_launched`,`1`);let n=document.getElementById(`setEngineSelect`);n&&(n.value=`external`,n.dispatchEvent(new Event(`change`))),e(!1)}),t.querySelector(`#welcome-skip`).addEventListener(`click`,()=>{t.remove(),localStorage.setItem(`ls_has_launched`,`1`),e(!1)})})}export{r as checkFirstLaunch};