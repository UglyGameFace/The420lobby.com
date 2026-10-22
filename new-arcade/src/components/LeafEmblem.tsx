import React from 'react';
/** Site-owned approved leaf artwork. The arcade shares the home page brand asset. */
export default function LeafEmblem({className=''}:{className?:string}){
  return <img src="/assets/approved-leaf.svg" className={className} alt="" aria-hidden="true" draggable={false}/>;
}
