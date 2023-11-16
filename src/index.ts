import { Application, Sprite, Texture, TilingSprite } from 'pixi.js';
import { TonClient4, Address, beginCell } from '@ton/ton';
import { TonConnectUI } from '@tonconnect/ui';
import {getHttpV4Endpoint, Network} from '@orbs-network/ton-access';
import { environment } from "./environments/environment";

(window as any).Telegram.WebApp.expand();

const GAME_HEIGHT = 600;
const GAP_MIN = 125;
const GAP_MAX = 175;
const GAP_START = GAME_HEIGHT / 6;
const GAP_END = GAME_HEIGHT - GAP_START - GAP_MAX;
const PIPE_INTERVAL_ACCEL = -0.04;
const PIPE_VELOCITY_ACCEL = -0.001;
const JUMP_VELOCITY = -6;
const GRAVITY = 0.2;
const JUMP_COOLDOWN = 20;
const FLAP_THRESH = -JUMP_VELOCITY / 6;
const PIPE_SCALE = 1.5;
const PIPE_WIDTH = 52 * PIPE_SCALE;
const BACKGROUND_HEIGHT = 512;

class Game {
    app: Application;

    pipeGreenTex!: Texture;
    pipeRedTex!: Texture;
    pipesTex!: Record<string, Texture>;
    birdMidTex!: Texture;
    birdUpTex!: Texture;
    birdDownTex!: Texture;
    backgroundTex!: Texture;

    RATIO: number;
    REAL_GAME_WIDTH: number;

    pipes: { p1: Sprite, p2: Sprite, counted: boolean }[] = [];
    pipeVelocity = -1;
    pipeInterval = 3000;
    lastPipeSpawned = 0;
    score = 0;
    birdVelocity = 0;
    lastJump = 0;

    bird!: Sprite;

    async loadTextures() {
        this.pipeGreenTex = await Texture.fromURL('assets/pipe-green.png');
        this.pipeRedTex = await Texture.fromURL('assets/pipe-red.png');
        this.pipesTex = {
            'pipe-green': this.pipeGreenTex,
            'pipe-red': this.pipeRedTex,
        };
        this.birdMidTex = await Texture.fromURL('assets/bluebird-midflap.png');
        this.birdUpTex = await Texture.fromURL('assets/bluebird-upflap.png');
        this.birdDownTex = await Texture.fromURL('assets/bluebird-downflap.png');
        this.backgroundTex = await Texture.fromURL('assets/background-day.png');
    }

    constructor() {
        this.app = new Application({
            resizeTo: window,
        });

        document.body.appendChild(this.app.view as HTMLCanvasElement);

        this.RATIO = this.app.screen.height / GAME_HEIGHT;

        this.app.stage.scale = { x: this.RATIO, y: this.RATIO };
        this.REAL_GAME_WIDTH = this.app.screen.width / this.RATIO;

        this.loadTextures().then(() => {
            this.init();
        });
    }

    init() {
        const BACKGROUND_SCALE = GAME_HEIGHT / BACKGROUND_HEIGHT;
        const background = new TilingSprite(this.backgroundTex, this.REAL_GAME_WIDTH, GAME_HEIGHT);
        background.tileScale = {
            x: BACKGROUND_SCALE,
            y: BACKGROUND_SCALE,
        };
        this.app.stage.addChild(background);

        this.bird = this.newBird();
        this.app.stage.addChild(this.bird);
        this.bird.x = this.REAL_GAME_WIDTH / 8;
        this.bird.y = GAME_HEIGHT / 2;

        this.app.ticker.add((delta) => {
            this.birdVelocity += delta * GRAVITY;
            this.bird.y += delta * this.birdVelocity;

            if (this.birdVelocity < -FLAP_THRESH) {
                this.bird.texture = this.birdDownTex;
            } else if (this.birdVelocity > FLAP_THRESH) {
                this.bird.texture = this.birdUpTex;
            } else {
                this.bird.texture = this.birdMidTex;
            }
        });

        this.app.ticker.add(() => {
            if (this.bird.y < 0 || this.bird.y > GAME_HEIGHT - this.bird.height) {
                this.onOverlapped();
                return;
            }

            for (const pp of this.pipes) {
                if (!(this.bird.x > pp.p1.x - this.bird.width && this.bird.x < pp.p1.x + PIPE_WIDTH)) continue;
                if (this.bird.y < pp.p1.y || this.bird.y > pp.p2.y - this.bird.height) {
                    this.onOverlapped();
                    return;
                }
            }
        });

        this.app.renderer.events.domElement.addEventListener('pointerdown', () => { this.onClick() });
        window.addEventListener('keydown', () => { this.onClick() });

        this.app.ticker.add((delta) => {
            this.pipeInterval += PIPE_INTERVAL_ACCEL * delta;
            this.pipeVelocity += PIPE_VELOCITY_ACCEL * delta;
            if (Date.now() > this.lastPipeSpawned + this.pipeInterval) {
                this.lastPipeSpawned = Date.now();
                const gapStart = GAP_START + Math.random() * (GAP_END - GAP_START);
                const gapSize = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
                const p1 = this.newPipe();
                p1.x = this.REAL_GAME_WIDTH;
                p1.y = gapStart;
                p1.scale = { x: PIPE_SCALE, y: -PIPE_SCALE };
                const p2 = this.newPipe();
                p2.x = this.REAL_GAME_WIDTH;
                p2.y = gapStart + gapSize;
                p2.scale = { x: PIPE_SCALE, y: PIPE_SCALE };
                this.app.stage.addChild(p1);
                this.app.stage.addChild(p2);
                this.pipes.push({ p1, p2, counted: false });
            }
            for (let i = 0; i < this.pipes.length; i++) {
                const pp = this.pipes[i];
                pp.p1.x += this.pipeVelocity;
                pp.p2.x += this.pipeVelocity;
                if (pp.p1.x < -PIPE_WIDTH) {
                    this.app.stage.removeChild(pp.p1, pp.p2);
                    this.pipes.splice(i, 1);
                    i--;
                } else if (pp.p1.x < this.bird.x - PIPE_WIDTH && !pp.counted) {
                    pp.counted = true;
                    this.score++;
                    ui.setScore(this.score);
                }
            }
        });

        ui.onPlayClicked(() => {
            ui.hideShop();
            ui.hideMain();

            this.restart();
        });

        // dirty hack to make the textures load
        this.app.ticker.addOnce(() => {
            this.app.stop();
        });
    }

    newPipe() {
        return Sprite.from(this.pipesTex[ui.getCurrentPipe()]);
    }

    newBird() {
        return Sprite.from(this.birdMidTex);
    }

    restart() {
        for (const pp of this.pipes) {
            this.app.stage.removeChild(pp.p1, pp.p2);
        }
        this.pipes = [];
        this.pipeVelocity = -1;
        this.pipeInterval = 3000;
        this.lastPipeSpawned = 0;
        this.score = 0;
        ui.setScore(0);
        this.birdVelocity = 0;
        this.lastJump = 0;
        this.bird.y = GAME_HEIGHT / 2;
        this.app.start();
    }

    onClick() {
        if (Date.now() > this.lastJump + JUMP_COOLDOWN) {
            this.lastJump = Date.now();
            this.birdVelocity = JUMP_VELOCITY;
        }
    }

    async onOverlapped() {
        this.app.stop();

        ui.showLoading();

        try {
            const playedInfo = await submitPlayed(this.score) as any;

            if (!playedInfo.ok) throw new Error('Unsuccessful');

            ui.showMain(true, {
                reward: playedInfo.reward,
                achievements: playedInfo.achievements.map((a: string) => achievements[a]),
            });
        } catch (e) {
            console.error(e);

            ui.showMain(true, {
                error: 'Could not load your rewards information',
            });
        }

        ui.hideLoading();
    }
}

// UI

const achievements: { [k: string]: string } = {
    'first-time': 'Played 1 time',
    'five-times': 'Played 5 times',
};

async function submitPlayed(score: number) {
    return await (await fetch(ENDPOINT + '/played', {
        body: JSON.stringify({
            tg_data: (window as any).Telegram.WebApp.initData,
            wallet: tc.account?.address,
            score,
        }),
        headers: {
            'content-type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        },
        method: 'POST',
    })).json();
}

const tc = new TonConnectUI({
    manifestUrl: 'https://raw.githubusercontent.com/ton-defi-org/tonconnect-manifest-temp/main/tonconnect-manifest.json',
});

const PIPES_AVAILABLE = ['pipe-green', 'pipe-red'];
const PIPES_COSTS = [0, 1];
const SHOP_RELOAD_INTERVAL = 10000;
const BALANCE_RELOAD_INTERVAL = 10000;

const ENDPOINT = environment.ENDPOINT;
// const TOKEN_RECIPIENT = environment.TOKEN_RECIPIENT;
// const TOKEN_MASTER = environment.TOKEN_MASTER;
// const NETWORK = environment.NETWORK;

class UI {
    scoreDiv: HTMLDivElement = document.getElementById('score') as HTMLDivElement;
    rewardsDiv: HTMLDivElement = document.getElementById('rewards') as HTMLDivElement;
    spinnerDiv: HTMLDivElement = document.getElementById('spinner-container') as HTMLDivElement;
    connectDiv: HTMLDivElement = document.getElementById('connect') as HTMLDivElement;
    skinChooserDiv: HTMLDivElement = document.getElementById('skin-chooser') as HTMLDivElement;
    skinPrevDiv: HTMLDivElement = document.getElementById('skin-prev') as HTMLDivElement;
    skinCurrentDiv: HTMLDivElement = document.getElementById('skin-current') as HTMLDivElement;
    skinImage: HTMLImageElement = document.getElementById('skin-image') as HTMLImageElement;
    skinNextDiv: HTMLDivElement = document.getElementById('skin-next') as HTMLDivElement;
    useButton: HTMLButtonElement = document.getElementById('use') as HTMLButtonElement;
    shopButton: HTMLButtonElement = document.getElementById('shop') as HTMLButtonElement;
    playButton: HTMLButtonElement = document.getElementById('play') as HTMLButtonElement;
    buttonsDiv: HTMLDivElement = document.getElementById('buttons') as HTMLDivElement;
    balanceDiv: HTMLDivElement = document.getElementById('balance') as HTMLDivElement;
    playTextDiv: HTMLDivElement = document.getElementById('play-text') as HTMLDivElement;
    useTextDiv: HTMLDivElement = document.getElementById('use-text') as HTMLDivElement;
    balanceContainerDiv: HTMLDivElement = document.getElementById('balance-container') as HTMLDivElement;
    afterGameDiv: HTMLDivElement = document.getElementById('after-game') as HTMLDivElement;
    errorDiv: HTMLDivElement = document.getElementById('error') as HTMLDivElement;
    tokensAwardedDiv: HTMLDivElement = document.getElementById('tokens-awarded') as HTMLDivElement;
    newAchievementsDiv: HTMLDivElement = document.getElementById('new-achievements') as HTMLDivElement;

    currentPipeIndex = Number(window.localStorage.getItem('chosen-pipe') ?? '0');
    previewPipeIndex = this.currentPipeIndex;

    shopShown = false;

    purchases: { systemName: string }[] = [];

    reloadShopTimeout: any = undefined;

    client: TonClient4 | undefined = undefined;
    jettonWallet: Address | undefined = undefined;

    async redrawBalance() {
        const bal = await this.getBalance();
        this.balanceDiv.innerText = bal.toString();
        this.balanceContainerDiv.style.display = 'block';
        setTimeout(() => this.redrawBalance(), BALANCE_RELOAD_INTERVAL);
    }

    async getBalance() {
        try {
            const client = await this.getClient();
            const jw = await this.getJettonWallet();
            const last = await client.getLastBlock();
            const r = await client.runMethod(last.last.seqno, jw, 'get_wallet_data');
            return r.reader.readBigNumber();
        } catch (e) {
            return BigInt(0);
        }
    }

    // TODO: FIX ME - INCONSISTENT BETWEEN SERVER AND CLIENT
    async getJettonWallet() {
        if (this.jettonWallet === undefined) {
            const TOKEN_MASTER = await this.getTokenMinter();

            const client = await this.getClient();
            if (tc.account === null) {
                throw new Error('No account');
            }
            const lastBlock = await client.getLastBlock();
            const r = await client.runMethod(lastBlock.last.seqno, Address.parse(TOKEN_MASTER), 'get_wallet_address', [{
                type: 'slice',
                cell: beginCell().storeAddress(Address.parse(tc.account.address)).endCell(),
            }]);
            const addrItem = r.result[0];
            if (addrItem.type !== 'slice') throw new Error('Bad type');
            this.jettonWallet = addrItem.cell.beginParse().loadAddress();
        }
        return this.jettonWallet;
    }

    async getClient() {
        if (this.client === undefined) {
            const NETWORK = await this.getNetwork();

            this.client = new TonClient4({
                endpoint: await getHttpV4Endpoint({ network: NETWORK }),
            });
        }
        return this.client;
    }

    async buy(itemId: number) {
      const TOKEN_RECIPIENT = await this.getTokenRecipient();

      await tc.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        messages: [
          {
            address: (await this.getJettonWallet()).toString(),
            amount: '50000000',
            payload: beginCell().storeUint(0x0f8a7ea5, 32).storeUint(0, 64).storeCoins(PIPES_COSTS[this.previewPipeIndex]).storeAddress(Address.parse(TOKEN_RECIPIENT)).storeAddress(Address.parse(tc.account!.address)).storeMaybeRef(undefined).storeCoins(1).storeMaybeRef(beginCell().storeUint(0, 32).storeStringTail((window as any).Telegram.WebApp.initDataUnsafe.user.id + ':' + itemId)).endCell().toBoc().toString('base64'),
          },
        ],
      })
    }

    constructor() {
        this.skinPrevDiv.addEventListener('click', () => {
            this.previewPipeIndex--;
            this.redrawShop();
        });
        this.skinNextDiv.addEventListener('click', () => {
            this.previewPipeIndex++;
            this.redrawShop();
        });
        this.useButton.addEventListener('click', () => {
            if (this.previewPipeIndex !== 0 && this.purchases.findIndex(p => p.systemName === this.getPreviewPipe()) === -1) {
                this.buy(this.previewPipeIndex);
                return;
            }
            this.currentPipeIndex = this.previewPipeIndex;
            window.localStorage.setItem('chosen-pipe', this.currentPipeIndex.toString());
            this.redrawShop();
        });
        this.shopButton.addEventListener('click', () => {
            if (this.shopShown) this.hideShop();
            else this.showShop();
        });
        this.connectDiv.addEventListener('click', () => {
            tc.connectWallet();
        });
    }

    showLoading() {
        this.spinnerDiv.style.display = 'unset';
    }

    hideLoading() {
        this.spinnerDiv.style.display = 'none';
    }

    showMain(again: boolean, results?: { reward: 0, achievements: string[] } | { error: string }) {
        if (again) {
            this.playButton.classList.add('button-wide');
            this.playTextDiv.innerText = 'Play again';
        }
        if (results !== undefined) {
            this.afterGameDiv.style.display = 'block';
            if ('error' in results) {
                this.rewardsDiv.style.display = 'none';
                this.errorDiv.innerText = results.error;
                this.errorDiv.style.display = 'block';
            } else {
                this.errorDiv.style.display = 'none';
                this.rewardsDiv.style.display = 'flex';
                this.tokensAwardedDiv.innerText = results.reward.toString();
                if (results.achievements.length > 0) {
                    const achNodes = [results.achievements.length > 1 ? 'New achievements!' : 'New achievement!', ...results.achievements].map(a => {
                        const div = document.createElement('div');
                        div.className = 'flappy-text award-text';
                        div.innerText = a;
                        return div;
                    });
                    this.newAchievementsDiv.replaceChildren(...achNodes);
                } else {
                    this.newAchievementsDiv.replaceChildren();
                }
            }
        }
        this.buttonsDiv.style.display = 'flex';
    }

    hideMain() {
        this.afterGameDiv.style.display = 'none';
        this.buttonsDiv.style.display = 'none';
    }

    getCurrentPipe() {
        return PIPES_AVAILABLE[this.currentPipeIndex];
    }

    getPreviewPipe() {
        return PIPES_AVAILABLE[this.previewPipeIndex];
    }

    redrawShop() {
        this.skinImage.src = 'assets/' + this.getPreviewPipe() + '.png';
        this.skinPrevDiv.style.display = this.previewPipeIndex > 0 ? 'unset' : 'none';
        this.skinNextDiv.style.display = this.previewPipeIndex < PIPES_AVAILABLE.length - 1 ? 'unset' : 'none';
        const bought = this.purchases.findIndex(p => p.systemName === this.getPreviewPipe()) >= 0;
        if (this.previewPipeIndex === this.currentPipeIndex) {
            this.useTextDiv.innerText = 'Used';
            this.useButton.className = 'button-narrow';
        } else if (this.previewPipeIndex === 0 || bought) {
            this.useTextDiv.innerText = 'Use';
            this.useButton.className = 'button-narrow';
        } else {
            this.useTextDiv.innerText = 'Buy for ' + PIPES_COSTS[this.previewPipeIndex];
            this.useButton.className = 'button-narrow button-wide';
        }
    }

    async reloadPurchases() {
        this.reloadShopTimeout = undefined;

        try {
            const purchasesData = await (
              await fetch(ENDPOINT + '/purchases?auth=' + encodeURIComponent((window as any).Telegram.WebApp.initData), {
                headers: {
                  'ngrok-skip-browser-warning': 'true'
                }
              })
            ).json();
            if (!this.shopShown) return;
            if (!purchasesData.ok) throw new Error('Unsuccessful');

            this.purchases = purchasesData.purchases;

            this.redrawShop();
        } catch (e) {}

        this.reloadShopTimeout = setTimeout(() => this.reloadPurchases(), SHOP_RELOAD_INTERVAL);
    }

    async getConfig(): Promise<{
      ok: false
    } | {
      ok: true,
      config: {
        network: Network,
        tokenMinter: string,
        tokenRecipient: string,
        achievementCollection: Record<string, string>,
      }
    }> {
      return await (await fetch(ENDPOINT + '/config', {
        headers: {
          'ngrok-skip-browser-warning': 'true'
        }
      })).json();
    }

    async getNetwork(): Promise<Network> {
        const config = await this.getConfig();
        if (!config.ok) throw new Error('Unsuccessful');
        return config.config.network;
    }

    async getTokenMinter(): Promise<string> {
        const config = await this.getConfig();
        if (!config.ok) throw new Error('Unsuccessful');
        return config.config.tokenMinter;
    }

    async getTokenRecipient(): Promise<string> {
        const config = await this.getConfig();
        if (!config.ok) throw new Error('Unsuccessful');
        return config.config.tokenRecipient;
    }

    async showShop() {
        this.afterGameDiv.style.display = 'none';
        this.hideMain();
        this.showLoading();

        try {
            const purchasesData = await (
              await fetch(ENDPOINT + '/purchases?auth=' + encodeURIComponent((window as any).Telegram.WebApp.initData), {
                headers: {
                  'ngrok-skip-browser-warning': 'true'
                }
              })
            ).json();
            if (!purchasesData.ok) throw new Error('Unsuccessful');

            this.hideLoading();
            this.showMain(false);

            this.purchases = purchasesData.purchases;
        } catch (e) {
            this.hideLoading();
            this.showMain(false, {
                error: 'Could not load the shop',
            });
            return;
        }

        this.reloadShopTimeout = setTimeout(() => this.reloadPurchases(), SHOP_RELOAD_INTERVAL);

        this.shopShown = true;
        this.skinChooserDiv.style.display = 'flex';
        this.useButton.style.display = 'flex';
        this.previewPipeIndex = this.currentPipeIndex;
        this.redrawShop();
    }

    hideShop() {
        clearTimeout(this.reloadShopTimeout);
        this.reloadShopTimeout = undefined;
        this.shopShown = false;
        this.skinChooserDiv.style.display = 'none';
        this.useButton.style.display = 'none';
        this.afterGameDiv.style.display = 'block';
    }

    setScore(score: number) {
        this.scoreDiv.innerText = score.toString();
    }

    onPlayClicked(fn: () => void) {
        this.playButton.addEventListener('click', fn);
    }

    transitionToGame() {
        this.connectDiv.style.display = 'none';
        this.scoreDiv.style.display = 'inline-block';
        this.buttonsDiv.style.display = 'flex';
    }
}

const ui = new UI();

let game: Game | null = null;

tc.onStatusChange((wallet) => {
    if (game === null && wallet !== null) {
        ui.transitionToGame();
        ui.showMain(false);
        ui.redrawBalance();
        game = new Game();
    }
});
