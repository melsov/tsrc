
export namespace Mel
{
    export class LobbyUI
    {
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


    }
}