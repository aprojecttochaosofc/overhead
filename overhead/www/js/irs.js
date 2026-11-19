(function(){
'use strict';
window.OverheadModules=window.OverheadModules||[];
function sendPulseToPython(packet){
  const bridge=window.OverheadPythonBridge;
  if(bridge&&typeof bridge.sendPulse==='function')return bridge.sendPulse(packet);
  window.dispatchEvent(new CustomEvent('overhead:python-pulse',{detail:packet}));
  return false;
}
window.OverheadModules.push({
  "id": "ADIRS",
  "controls": [
    {
      "name": "IRS 1",
      "x": 145,
      "y": 235,
      "type": "knob",
      "positions": [
        "OFF",
        "NAV",
        "ATT"
      ],
      "vjoyButtons": [
        1,
        2,
        3
      ],
      "angles": [
        -45,
        0,
        45
      ]
    },
    {
      "name": "IRS 3",
      "x": 365,
      "y": 235,
      "type": "knob",
      "positions": [
        "OFF",
        "NAV",
        "ATT"
      ],
      "vjoyButtons": [
        4,
        5,
        6
      ],
      "angles": [
        -45,
        0,
        45
      ]
    },
    {
      "name": "IRS 2",
      "x": 583,
      "y": 235,
      "type": "knob",
      "positions": [
        "OFF",
        "NAV",
        "ATT"
      ],
      "vjoyButtons": [
        7,
        8,
        9
      ],
      "angles": [
        -45,
        0,
        45
      ]
    }
  ],
  actions:(function(){
    function sendPosition(name,position){
      const control=window.OverheadModules.find(module=>module.id==='ADIRS').controls.find(item=>item.name===name);
      if(!control)return false;
      const index=control.positions.indexOf(position);
      const button=control.vjoyButtons[index];
      if(!button)return false;
      const packet={module:'ADIRS',control:name,position:position,kind:'buttonPulse',vjoyButton:button};
      sendPulseToPython(packet);
      return packet;
    }
    return {
      sendOff:function(name){return sendPosition(name,'OFF')},
      sendNav:function(name){return sendPosition(name,'NAV')},
      sendAtt:function(name){return sendPosition(name,'ATT')}
    };
  })(),
  onPositionSelected:function(event){
    const action=this.actions[{OFF:'sendOff',NAV:'sendNav',ATT:'sendAtt'}[event.position]];
    if(action)action(event.name);
  }
});
})();
