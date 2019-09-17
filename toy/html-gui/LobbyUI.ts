
export namespace Mel
{
    export class LobbyUI
    {
        private respawnCountdownDisplay : HTMLElement = <HTMLElement> document.getElementById('respawnCountdown');
        private enterGameButton : HTMLButtonElement = <HTMLButtonElement> document.getElementById('button-enter-game');
        private lobbyContainer : HTMLElement = <HTMLElement> document.getElementById('lobby-container');
        public handleEnterGamePressed : (ev : MouseEvent) => void = () => {};

        constructor()
        {
            this.enterGameButton.onclick = (ev : MouseEvent) => {
                this.handleEnterGamePressed(ev);
            };
        }
        
        showHide(show : boolean) : void
        {
            this.lobbyContainer.style.display = show ? 'inline' : 'none';
        }
        
        showCountDown(remainingSeconds : number) : void
        {
            this.toggleEnterOrCountdownVisible(false);
            this.respawnCountdownDisplay.innerText = `${remainingSeconds}`;
        }
        
        showEnterButton() : void
        {
            this.toggleEnterOrCountdownVisible(true);
        }

        private toggleEnterOrCountdownVisible(wantEnter : boolean) 
        {
            this.enterGameButton.style.display = wantEnter ? 'inline' : 'none';
            this.respawnCountdownDisplay.style.display = wantEnter ? 'none' : 'inline';
        }


    }
}