
<h1>A typescript listen server.</h1>

If you're reading this and you're not me, I wouldn't recommend this repo. 

Many things need major redesigns.

Requires the following npm modules:

<code>
firebase
firebase-auth
babylonjs
babylonjs-materials
babylonjs-gui
typescript-collections
</code>

To compile to javascript:

--put the root directory ('tsrc') in a typescript project directory (with an appropriate 'tsconfig.json' file).
--compile tsrc to a sibling directory (e.g. 'src')
--use webpack to pack the contents of src to another sibling directory (e.g. 'dist')


