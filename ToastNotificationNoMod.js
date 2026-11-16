
class ToastNotification {

    constructor()
    {
		this.timerId  = null;
		this.promiseResolve = null;

		this.html    = document.createRange().createContextualFragment( `
			<div id="DSkipNotification" class="DSkipNotification-hide" hidden>
				<p id="DSkipNotification-content"></p>
				<button type="button" id="DSkipNotification-ok" hidden>OK</button>
			</div>
		` );

		this.domTree = {
			root:    this.html.firstElementChild,
			content: this.html.getElementById( "DSkipNotification-content" ),
			ok     : this.html.getElementById( "DSkipNotification-ok" )
		};

		this.domTree.root.addEventListener( "transitionend", ( e ) => {
			if( e.currentTarget.classList.contains( "DSkipNotification-hide" ) ){
				this.domTree.content.textContent = "";
				e.currentTarget.hidden = true;
			}
		} );

		this.domTree.ok.addEventListener( "click", () => {
			this.#close();
			if( this.promiseResolve ){
				this.promiseResolve();
				this.promiseResolve = null;
			}
		} );
    }

	#close()
	{
		this.domTree.root.classList.replace( "DSkipNotification-show", "DSkipNotification-hide" );
		this.timerId = null;
	}

	getRootElement()
	{
		return this.domTree.root;
	}

	show( text, interactive = false, async = false )
	{
		let promise;

		if( this.timerId ){
			if( async ) throw new Error( "An interactive notification is already in progress." );
			clearTimeout( this.timerId );
		}

		this.domTree.content.textContent = text;
		this.domTree.root.hidden = false;

		if( interactive ){
			this.domTree.ok.hidden = false;
			if( async ) promise = new Promise( ( resolve ) => { this.promiseResolve = resolve; } );
		} else{
			this.domTree.ok.hidden = true;
			this.timerId = setTimeout( () => this.#close(), 3000 );
		}
		
		this.domTree.root.classList.replace( "DSkipNotification-hide", "DSkipNotification-show" );

		return promise;
	}

	hide()
	{
		if( this.timerId ){
			clearTimeout( this.timerId );
			this.#close();
		}
	}
}