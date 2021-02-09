import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as functions from 'firebase-functions';

interface IImportedModule {
  [ key: string ]: any;
}

type ExportGroup = Map<string, any>;
type ExportGroups = Map<string, ExportGroup>;

const applyExports = ( exportGroups: ExportGroups ): void => {
  exportGroups.forEach( ( group, groupKey ) => {
    exports[ groupKey ] = {};
    group.forEach( ( groupFunction, functionKey ) => {
      exports[ groupKey ][ functionKey ] = groupFunction;
    } );
  } );

  console.log( exports );
}

const addReactiveGroups = ( exportGroups: ExportGroups ): ExportGroups => {
  console.log( 'ExportHelper - Adding reactive cloud functions ... ' );
  const glob = require( "glob" );
  // Get all the files that have ".function" in the file name
  const functionFiles = glob.sync( '../**/*.function.js', { cwd: __dirname, ignore: './node_modules/**' } );

  for ( let i = 0, fl = functionFiles.length; i < fl; i++ ) {
    const file = functionFiles[ i ];
    const groupName = file.split( '/' )[ 1 ];
    const functionName = file.split( '/' )[ 3 ].slice( 0, -12 ); // Strip off '.function.js'

    if ( !process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === functionName ) {
      if ( !exportGroups.has( groupName ) ) {
        // Add export group
        exportGroups.set( groupName, new Map() );
      }

      const group = exportGroups.get( groupName );
      const importedModule: IImportedModule = require( file );

      for ( const key in importedModule ) {
        if ( Object.prototype.hasOwnProperty.call( importedModule, key ) ) {
          console.log( `ExportHelper - Add reactive function ${ key } to group ${ groupName }` );
          group?.set( key, importedModule[ key ] );
        }
      }
    }
  }

  return exportGroups;
}

const addIdleGroups = ( exportGroups: ExportGroups ): ExportGroups => {
  console.log( 'ExportHelper - Adding api cloud functions ... ' );

  const glob = require( "glob" );
  const apiFiles = glob.sync( '../**/*.api.js', { cwd: __dirname, ignore: './node_modules/**' } );

  for ( let f = 0, fl = apiFiles.length; f < fl; f++ ) {
    const file = apiFiles[ f ];
    const groupName = file.split( '/' )[ 1 ];

    const apiModule = require( file );
    const app = express();

    app.use( '/', apiModule.api );
    app.use( bodyParser.json() );
    app.use( bodyParser.urlencoded( { extended: false } ) );

    if ( !exportGroups.has( groupName ) ) {
      // Add export group
      exportGroups.set( groupName, new Map() );
    }

    const group = exportGroups.get( groupName );

    console.log( `ExportHelper - Add api for ${ groupName }` );
    group?.set( "api", functions.https.onRequest( app ) );
  }

  return exportGroups;
}

export const exportGroups = (): any => {
  const exportGroups: ExportGroups = new Map<string, Map<string, any>>();

  addReactiveGroups( exportGroups );
  addIdleGroups( exportGroups );
  applyExports( exportGroups );
}

/**
 * This class helps with setting up the exports for the cloud functions deployment.
 *
 * It takes in exports and then adds the required groups and their functions to it for deployment
 * to the cloud functions server.
 */