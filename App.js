import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, ScrollView, 
  TextInput, SafeAreaView, StatusBar, Dimensions, Vibration,
  KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, Image, Alert, ActivityIndicator, Modal, FlatList, Animated
} from 'react-native';
import { 
  Users, RotateCcw, UserPlus, Trash2, 
  Shuffle, ChevronLeft, Zap, Star, Archive, XCircle, Trophy, CheckCircle2, Printer, Edit3, FastForward, BarChart3, Clock, AlertTriangle, Medal
} from 'lucide-react-native';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video, ResizeMode } from 'expo-av'; 
import ViewShot from "react-native-view-shot";
import * as Sharing from 'expo-sharing';

const { width } = Dimensions.get('window');

// Chaves do banco
const PLAYERS_STORAGE_KEY = '@setpoint_players';
const HISTORY_STORAGE_KEY = '@setpoint_history';
const STARTED_STORAGE_KEY = '@setpoint_started';
const STATS_STORAGE_KEY = '@setpoint_match_stats';

const AVIATION_CODES = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 
  'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 
  'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'
];

// --- COMPONENTE DE VÍDEO ---
const BackgroundVideo = memo(() => {
  const videoRef = useRef(null);
  const [videoIndex, setVideoIndex] = useState(0);
  const videos = [
    require('./assets/video1.mp4'),
    require('./assets/video2.mp4'),
    require('./assets/video3.mp4'),
  ];

  return (
    <View style={StyleSheet.absoluteFill}>
      <Video
        ref={videoRef}
        style={StyleSheet.absoluteFill}
        source={videos[videoIndex]}
        resizeMode={ResizeMode.COVER}
        isLooping={false} 
        shouldPlay={true}
        isMuted={true}
        onPlaybackStatusUpdate={status => {
          if (status.didJustFinish) setVideoIndex((prevIndex) => (prevIndex + 1) % videos.length);
        }}
      />
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.85)' }} />
    </View>
  );
});

// --- TELA DE INÍCIO ---
const StartScreen = ({ onStart }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = () => {
    setIsLoading(true);
    setTimeout(() => { setIsLoading(false); onStart(); }, 600);
  };

  return (
    <View style={styles.startContainer}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.startContent}>
        <View style={styles.startLogoArea}>
          <Image source={require('./assets/bola.png')} style={{ width: 140, height: 140, resizeMode: 'contain', marginBottom: 20 }} />
          <Text style={styles.startBrand}>Set<Text style={{color: '#f97316'}}>Point</Text></Text>
          <Text style={{color: '#64748b', fontSize: 14, marginTop: 5, fontWeight: '900', letterSpacing: 2}}>MATCH DAY COMPANION</Text>
        </View>
        <TouchableOpacity onPress={handleStart} style={styles.startButton} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="white" size="large" /> : <Text style={styles.startButtonText}>INICIAR</Text>}
        </TouchableOpacity>
        <Text style={{marginTop: 50, color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>Versão 4.0 • Pro Stats</Text>
      </View>
    </View>
  );
};

// --- COMPONENTES MEMORIZADOS ---
const PlayerTag = memo(({ player, onRemove, onToggleGender }) => (
  <View style={[styles.playerTag, player.gender === 'F' && styles.playerTagFemale]}>
    <TouchableOpacity onPress={() => onToggleGender(player.id)} style={{marginRight: 5}}>
        <Text style={{fontSize: 10}}>{player.gender === 'F' ? '👩' : '👱'}</Text>
    </TouchableOpacity>
    <Text style={styles.playerTagName} numberOfLines={1}>{player.name}</Text>
    <TouchableOpacity onPress={() => onRemove(player.id)} style={styles.deleteArea} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Trash2 size={16} color="#f87171" />
    </TouchableOpacity>
  </View>
));

const TeamResultCard = memo(({ team, index, codename, onRename }) => (
  <View style={styles.teamResultCard}>
    <View style={styles.teamHeaderRow}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1}}>
        <Star size={12} color="#2563eb" />
        <Text style={styles.teamResultLabel} numberOfLines={1}>{codename ? codename.toUpperCase() : `TIME ${index + 1}`}</Text>
      </View>
      {onRename && (
        <TouchableOpacity onPress={onRename} style={{padding: 5}}>
          <Edit3 size={16} color="#94a3b8" />
        </TouchableOpacity>
      )}
    </View>
    <Text style={styles.teamResultMembers}>{team.map(m => `${m.name}`).join(', ')}</Text>
  </View>
));

// Formatador de tempo de jogo
const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [view, setView] = useState('menu'); 
  const [category, setCategory] = useState(null); 
  const [mode, setMode] = useState(14); 
  
  // Placar, Histórico e Cronômetro
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [nameTeamA, setNameTeamA] = useState('TIME A');
  const [nameTeamB, setNameTeamB] = useState('TIME B');
  const [membersA, setMembersA] = useState([]);
  const [membersB, setMembersB] = useState([]);
  const [pointHistory, setPointHistory] = useState([]);
  const [matchStartTime, setMatchStartTime] = useState(null); // Cronômetro invisível

  // Match Stats DB
  const [matchStatsDB, setMatchStatsDB] = useState([]);

  const [isTieBreak, setIsTieBreak] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showTeamSelector, setShowTeamSelector] = useState(false);
  const [selectingFor, setSelectingFor] = useState(null);
  
  // Times e Sorteio
  const [players, setPlayers] = useState([]);
  const [playerName, setPlayerName] = useState('');
  const [playersPerTeam, setPlayersPerTeam] = useState(2);
  const [generatedTeams, setGeneratedTeams] = useState([]);
  const [draftTeams, setDraftTeams] = useState([]);
  const [history, setHistory] = useState([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isMixedMode, setIsMixedMode] = useState(false); 

  const [isDrafting, setIsDrafting] = useState(false);
  const [draftQueue, setDraftQueue] = useState([]);
  const [currentDraftingPlayer, setCurrentDraftingPlayer] = useState(null);
  const [revealedTeams, setRevealedTeams] = useState([]); 
  const fullDraftRef = useRef([]);

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [teamToRename, setTeamToRename] = useState({ id: null, currentName: '', isDraft: false });
  const [newNameInput, setNewNameInput] = useState('');

  const viewShotRef = useRef();
  const touchY = useRef(0);

  // Computa estatísticas em tempo real da partida atual
  const currentPlayerStats = pointHistory.reduce((acc, curr) => {
      // Pontos normais a favor
      if (curr.playerId && curr.type === 'point') {
          if (!acc[curr.playerId]) acc[curr.playerId] = { points: 0, serveErrors: 0 };
          acc[curr.playerId].points += 1;
      }
      // Erros de saque
      if (curr.errorByPlayer && curr.type === 'serve_error') {
          if (!acc[curr.errorByPlayer]) acc[curr.errorByPlayer] = { points: 0, serveErrors: 0 };
          acc[curr.errorByPlayer].serveErrors += 1;
      }
      return acc;
  }, {});

  useEffect(() => {
    const initApp = async () => {
      try {
        const started = await AsyncStorage.getItem(STARTED_STORAGE_KEY);
        if (started === 'true') setHasStarted(true);
        
        const savedPlayers = await AsyncStorage.getItem(PLAYERS_STORAGE_KEY);
        const savedHistory = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
        const savedStats = await AsyncStorage.getItem(STATS_STORAGE_KEY);
        
        if (savedPlayers) setPlayers(JSON.parse(savedPlayers));
        if (savedHistory) setHistory(JSON.parse(savedHistory));
        if (savedStats) setMatchStatsDB(JSON.parse(savedStats));
      } catch (e) {} finally { setIsAuthLoading(false); }
    };
    initApp();
  }, []);

  const saveData = useCallback(async (key, value) => {
    try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }, []);

  useEffect(() => { if (!isAuthLoading) saveData(PLAYERS_STORAGE_KEY, players); }, [players, saveData, isAuthLoading]);
  useEffect(() => { if (!isAuthLoading) saveData(HISTORY_STORAGE_KEY, history); }, [history, saveData, isAuthLoading]);
  useEffect(() => { if (!isAuthLoading) saveData(STATS_STORAGE_KEY, matchStatsDB); }, [matchStatsDB, saveData, isAuthLoading]);

  useEffect(() => {
    if (view === 'scoreboard') activateKeepAwake();
    else deactivateKeepAwake();
  }, [view]);

  // Lógica de Vitória
  useEffect(() => {
    const winPoint = mode + 1; 
    const tieBreakTrigger = mode; 

    if (category === 'amateur') {
        if (!isTieBreak && scoreA === tieBreakTrigger && scoreB === tieBreakTrigger) {
            setShowAnimation(true);
            Vibration.vibrate([0, 500, 100, 500]);
            setTimeout(() => { 
                setIsTieBreak(true); 
                setScoreA(0); 
                setScoreB(0); 
                // A história não pode ser apagada no tie-break
                setShowAnimation(false); 
            }, 3000);
            return;
        }

        if (!showAnimation && !winner) {
            if (isTieBreak) {
                if (scoreA === 3) setWinner(nameTeamA); else if (scoreB === 3) setWinner(nameTeamB);
            } else {
                if (scoreA >= winPoint) setWinner(nameTeamA); else if (scoreB >= winPoint) setWinner(nameTeamB);
            }
        }
    } else if (category === 'pro') {
        if (!winner) {
             const proWinPoint = mode + 1;
             if (scoreA >= proWinPoint && scoreA >= scoreB + 2) setWinner(nameTeamA);
             else if (scoreB >= proWinPoint && scoreB >= scoreA + 2) setWinner(nameTeamB);
             else if (scoreA === 30) setWinner(nameTeamA);
             else if (scoreB === 30) setWinner(nameTeamB);
        }
    }
  }, [scoreA, scoreB, mode, isTieBreak, showAnimation, winner, category, nameTeamA, nameTeamB]);

  // --- LÓGICA DE EVENTOS DO PLACAR ---

  const handleAddGenericPoint = (team) => {
      if (showAnimation || winner) return;
      Vibration.vibrate(70);
      if (team === 'A') setScoreA(s => s + 1);
      else setScoreB(s => s + 1);
      setPointHistory(prev => [...prev, { id: Date.now(), team, type: 'point', playerId: null, timestamp: Date.now() }]);
  };

  const handleAddPlayerPoint = (team, playerId) => {
      if (showAnimation || winner) return;
      const now = Date.now();
      
      setPointHistory(prev => {
          const newHistory = [...prev];
          for (let i = newHistory.length - 1; i >= 0; i--) {
              if (newHistory[i].team === team && newHistory[i].type === 'point') {
                  if (!newHistory[i].playerId && (now - newHistory[i].timestamp < 5000)) {
                      newHistory[i].playerId = playerId;
                      Vibration.vibrate(30); 
                      return newHistory;
                  }
                  break;
              }
          }
          
          if (team === 'A') setScoreA(s => s + 1);
          else setScoreB(s => s + 1);
          Vibration.vibrate(70);
          return [...newHistory, { id: Date.now(), team, type: 'point', playerId, timestamp: now }];
      });
  };

  const handleServeError = (team, playerId) => {
      if (showAnimation || winner) return;
      Vibration.vibrate([0, 100, 100]); 
      
      const scoringTeam = team === 'A' ? 'B' : 'A';
      if (scoringTeam === 'A') setScoreA(s => s + 1);
      else setScoreB(s => s + 1);

      setPointHistory(prev => [...prev, { 
          id: Date.now(), 
          team: scoringTeam, 
          errorByTeam: team, 
          errorByPlayer: playerId, 
          type: 'serve_error', 
          timestamp: Date.now() 
      }]);
  };

  const handleUndo = (team) => {
      if (showAnimation || winner) return;

      setPointHistory(prev => {
          const newHistory = [...prev];
          for (let i = newHistory.length - 1; i >= 0; i--) {
              if (newHistory[i].team === team) {
                  if (newHistory[i].type === 'point' && newHistory[i].playerId) {
                      newHistory[i].playerId = null;
                      Vibration.vibrate(40);
                      return newHistory;
                  } else {
                      newHistory.splice(i, 1);
                      if (team === 'A') setScoreA(s => Math.max(0, s - 1));
                      else setScoreB(s => Math.max(0, s - 1));
                      Vibration.vibrate([0, 50, 50, 50]);
                      return newHistory;
                  }
              }
          }
          if (team === 'A' && scoreA > 0) setScoreA(s => s - 1);
          if (team === 'B' && scoreB > 0) setScoreB(s => s - 1);
          return prev;
      });
  };

  const handleTouchStart = (e) => { touchY.current = e.nativeEvent.pageY; };
  const handleTouchEnd = (e, team) => {
      const diff = e.nativeEvent.pageY - touchY.current;
      if (diff < -40) handleAddGenericPoint(team); 
      else if (diff > 40) handleUndo(team); 
      else handleAddGenericPoint(team); 
  };

  // Prepara Placar
  const startNewMatch = () => {
      setScoreA(0); setScoreB(0);
      setPointHistory([]);
      setWinner(null); setIsTieBreak(false);
      setShowAnimation(false);
      setMatchStartTime(Date.now()); // Inicia o relógio
      setView('scoreboard');
  };

  // --- FINALIZAÇÃO E ESTATÍSTICAS ---
  const saveMatchToStatsAndExit = () => {
      if (winner) {
          const allMembers = [...membersA, ...membersB];
          const durationSecs = matchStartTime ? Math.floor((Date.now() - matchStartTime) / 1000) : 0;
          
          const finalStats = {
              id: Date.now(),
              date: new Date().toLocaleDateString(),
              duration: durationSecs,
              winnerTeam: winner,
              scoreA,
              scoreB,
              nameTeamA,
              nameTeamB,
              playerStats: currentPlayerStats,
              allMembers: allMembers
          };

          setMatchStatsDB(prev => [finalStats, ...prev]);
          Vibration.vibrate([0, 50, 50]);
      }
      
      setScoreA(0); setScoreB(0);
      setPointHistory([]);
      setWinner(null); setIsTieBreak(false);
      setShowAnimation(false);
      setView('menu');
  };

  const discardMatchAndExit = () => {
      setScoreA(0); setScoreB(0);
      setPointHistory([]);
      setWinner(null); setIsTieBreak(false);
      setShowAnimation(false);
      setView('menu');
  };

  const clearAllStats = () => {
      Alert.alert(
          "Limpar Estatísticas",
          "Tem certeza que deseja apagar todo o histórico de partidas salvas?",
          [
              { text: "Cancelar", style: "cancel" },
              { text: "Apagar Tudo", onPress: () => { setMatchStatsDB([]); Vibration.vibrate(100); }, style: "destructive" }
          ]
      );
  };


  // --- OUTRAS FUNÇÕES DO APP ---
  const handleAddPlayer = useCallback(() => {
    const input = playerName.trim();
    if (!input) return;
    const lines = input.split('\n');
    let newPlayersList = [];
    const playerPattern = /^[\d\s.\-\)]*\s*([^;,\n\[\(]+)(?:.*([\[\(][FM][\]\)]))?/i;

    lines.forEach(line => {
      const match = line.match(playerPattern);
      if (match) {
        let cleanName = match[1].trim();
        let genderMark = line.toUpperCase().includes('(F)') || line.toUpperCase().includes('[F]') ? 'F' : 'M';
        const lowerName = cleanName.toLowerCase();
        if (!lowerName.includes("lista") && cleanName.length >= 2) {
            if (!players.find(p => p.name.toLowerCase() === lowerName)) {
                newPlayersList.push({ id: Math.random().toString(36).substr(2, 9) + Date.now(), name: cleanName, gender: genderMark });
            }
        }
      }
    });
    if (newPlayersList.length > 0) {
      setPlayers(prev => [...prev, ...newPlayersList]);
      setPlayerName('');
      Vibration.vibrate(50);
    }
  }, [playerName, players]);

  const toggleGender = useCallback((id) => {
      setPlayers(prev => prev.map(p => p.id === id ? {...p, gender: p.gender === 'M' ? 'F' : 'M'} : p));
  }, []);

  const handleShuffle = useCallback(() => {
    if (players.length < 2) return;
    Keyboard.dismiss();
    
    let pool = [...players];
    let tempTeams = [];
    const numTeams = Math.ceil(pool.length / playersPerTeam);
    for (let i = 0; i < numTeams; i++) tempTeams.push([]);

    let teamIndex = 0;

    if (isMixedMode) {
        const women = pool.filter(p => p.gender === 'F').sort(() => Math.random() - 0.5);
        const men = pool.filter(p => p.gender === 'M').sort(() => Math.random() - 0.5);
        
        while (women.length > 0) {
            tempTeams[teamIndex].push(women.pop());
            teamIndex = (teamIndex + 1) % numTeams;
        }

        let menRemaining = men;
        while (menRemaining.length > 0) {
            tempTeams[teamIndex].push(menRemaining.pop());
            teamIndex = (teamIndex + 1) % numTeams;
        }
    } else {
        const shuffled = pool.sort(() => Math.random() - 0.5);
        while (shuffled.length > 0) {
            tempTeams[teamIndex].push(shuffled.pop());
            teamIndex = (teamIndex + 1) % numTeams;
        }
    }

    const validTeams = tempTeams.filter(t => t.length > 0);
    const namedTeams = validTeams.map((members, index) => ({
      id: Date.now() + index,
      codename: `Time ${index + 1}`,
      members: members
    }));

    fullDraftRef.current = namedTeams; 
    setRevealedTeams(namedTeams.map(t => ({ ...t, members: [] })));
    
    let queue = [];
    const maxMembers = Math.max(...namedTeams.map(t => t.members.length));
    for (let i = 0; i < maxMembers; i++) {
        for (let t = 0; t < namedTeams.length; t++) {
            if (namedTeams[t].members[i]) {
                queue.push({
                    teamId: namedTeams[t].id,
                    teamName: namedTeams[t].codename,
                    player: namedTeams[t].members[i]
                });
            }
        }
    }
    
    setDraftQueue(queue);
    setIsDrafting(true);
    setGeneratedTeams([]); 
    Vibration.vibrate(100);

  }, [players, playersPerTeam, isMixedMode]);

  useEffect(() => {
    if (!isDrafting) return;

    if (draftQueue.length === 0) {
        const finalTimer = setTimeout(() => {
            setIsDrafting(false);
            setDraftTeams(fullDraftRef.current);
            setCurrentDraftingPlayer(null);
            Vibration.vibrate([0, 100, 50, 100]);
        }, 1000);
        return () => clearTimeout(finalTimer);
    }

    const nextAction = draftQueue[0];
    setCurrentDraftingPlayer(nextAction);
    Vibration.vibrate(30);

    const timer = setTimeout(() => {
        setRevealedTeams(prev => prev.map(t => 
            t.id === nextAction.teamId 
            ? { ...t, members: [...t.members, nextAction.player] }
            : t
        ));
        setDraftQueue(prev => prev.slice(1));
    }, 500); 

    return () => clearTimeout(timer);
  }, [isDrafting, draftQueue]);

  const skipDraftAnimation = () => {
      setIsDrafting(false);
      setDraftQueue([]);
      setCurrentDraftingPlayer(null);
      setDraftTeams(fullDraftRef.current);
      Vibration.vibrate(50);
  };

  const openRenameModal = (id, currentName, isDraft) => {
    setTeamToRename({ id, currentName, isDraft });
    setNewNameInput(currentName);
    setRenameModalVisible(true);
  };

  const saveTeamName = () => {
    if (!newNameInput.trim()) return;
    if (teamToRename.isDraft) setDraftTeams(prev => prev.map(t => t.id === teamToRename.id ? { ...t, codename: newNameInput } : t));
    else setGeneratedTeams(prev => prev.map(t => t.id === teamToRename.id ? { ...t, codename: newNameInput } : t));
    setRenameModalVisible(false);
    Vibration.vibrate(20);
  };

  const confirmDraft = () => {
      setGeneratedTeams(draftTeams);
      setDraftTeams([]);
      Vibration.vibrate([0, 50, 50, 50]);
      Alert.alert("Sucesso", "Times salvos! Selecione no placar.");
  };

  const cancelDraft = () => { setDraftTeams([]); };

  const exportTeamsAsImage = async () => {
      try {
          const uri = await viewShotRef.current.capture();
          if (!(await Sharing.isAvailableAsync())) { Alert.alert("Erro", "Indisponível"); return; }
          await Sharing.shareAsync(uri);
      } catch (err) { Alert.alert("Erro", "Falha ao exportar"); }
  };
  
  const archiveTeams = useCallback(() => {
    if (generatedTeams.length === 0) return;
    setHistory(prev => [{ id: Date.now(), teams: generatedTeams }, ...prev]);
    setGeneratedTeams([]);
    Vibration.vibrate(50);
  }, [generatedTeams]);

  const clearCurrentTeams = useCallback(() => {
    setGeneratedTeams([]);
    Vibration.vibrate(50);
  }, []);

  const selectTeamForScoreboard = (team) => {
      if (selectingFor === 'A') {
          setNameTeamA(team.codename);
          setMembersA(team.members);
      }
      else if (selectingFor === 'B') {
          setNameTeamB(team.codename);
          setMembersB(team.members);
      }
      setShowTeamSelector(false);
      setScoreA(0); setScoreB(0); setPointHistory([]); setMatchStartTime(Date.now());
  };

  // --- RENDERIZAÇÃO ---
  if (isAuthLoading) return <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator size="large" color="#fbbf24" /></View>;
  
  if (!hasStarted) {
    return <StartScreen onStart={() => { setHasStarted(true); AsyncStorage.setItem(STARTED_STORAGE_KEY, 'true'); }} />;
  }

  if (view === 'teams') {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: 'white' }}>
          <SafeAreaView style={{flex:1}}>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={styles.headerWhite}>
                <TouchableOpacity onPress={() => setView('amateurHub')}><ChevronLeft color="#0f172a" size={32}/></TouchableOpacity>
                <Text style={styles.titleBlack}>Sorteio de Times</Text>
              </View>

              {isDrafting ? (
                  <View style={styles.draftingOverlay}>
                      <Text style={styles.draftingTitle}>SORTEANDO TIMES...</Text>
                      <View style={styles.currentPlayerCard}>
                          {currentDraftingPlayer ? (
                              <>
                                <Text style={styles.draftingName}>{currentDraftingPlayer.player.name}</Text>
                                <Text style={styles.draftingDestination}>Indo para o <Text style={{color: '#f97316'}}>{currentDraftingPlayer.teamName}</Text></Text>
                              </>
                          ) : <ActivityIndicator size="large" color="#f97316" />}
                      </View>
                      <View style={{width: '100%', marginTop: 20}}>
                          {revealedTeams.map((t, i) => <TeamResultCard key={i} team={t.members} index={i} codename={t.codename} />)}
                      </View>
                      <TouchableOpacity onPress={skipDraftAnimation} style={styles.skipButton}>
                          <FastForward color="#64748b" size={16} />
                          <Text style={styles.skipButtonText}>PULAR ANIMAÇÃO</Text>
                      </TouchableOpacity>
                  </View>
              ) : draftTeams.length > 0 ? (
                  <View style={styles.draftContainer}>
                      <Text style={styles.draftTitle}>CONFIRMAR TIMES?</Text>
                      {draftTeams.map((t, i) => (
                        <TouchableOpacity key={i} onPress={() => openRenameModal(t.id, t.codename, true)}>
                          <TeamResultCard index={i} team={t.members} codename={t.codename} onRename={() => openRenameModal(t.id, t.codename, true)} />
                        </TouchableOpacity>
                      ))}
                      <View style={styles.draftActions}>
                          <TouchableOpacity onPress={cancelDraft} style={[styles.draftBtn, {backgroundColor: '#ef4444'}]}><XCircle color="white" size={24} /><Text style={styles.btnTextWhite}>DESCARTAR</Text></TouchableOpacity>
                          <TouchableOpacity onPress={confirmDraft} style={[styles.draftBtn, {backgroundColor: '#22c55e'}]}><CheckCircle2 color="white" size={24} /><Text style={styles.btnTextWhite}>SALVAR</Text></TouchableOpacity>
                      </View>
                  </View>
              ) : (
                <>
                  <View style={styles.cardInput}>
                     <Text style={styles.labelSmall}>ADICIONAR (Use [F] para Feminino)</Text>
                     <TextInput multiline={isBatchMode} style={[styles.inputField, isBatchMode && {height: 100}]} placeholder={isBatchMode ? "Ex: 1. Ana [F]\n2. Pedro" : "Nome..."} value={playerName} onChangeText={setPlayerName} />
                     <TouchableOpacity onPress={handleAddPlayer} style={styles.addPlayerBtn}><Text style={styles.btnTextWhite}>ADICIONAR</Text></TouchableOpacity>
                     <TouchableOpacity onPress={() => setIsBatchMode(!isBatchMode)}><Text style={styles.toggleText}>{isBatchMode ? "Modo Simples" : "Colar Lista"}</Text></TouchableOpacity>
                  </View>

                  <View style={styles.sectionContainer}>
                     <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                        <Text style={styles.labelSmall}>CONFIGURAÇÃO</Text>
                        <TouchableOpacity onPress={() => setIsMixedMode(!isMixedMode)} style={[styles.mixedBadge, isMixedMode && {backgroundColor: '#d946ef'}]}>
                            <Text style={{color: 'white', fontWeight: 'bold', fontSize: 10}}>{isMixedMode ? 'MISTO ATIVO' : 'MISTO OFF'}</Text>
                        </TouchableOpacity>
                     </View>
                     <View style={styles.rowGap}>
                        {[2, 4, 6].map(num => (
                            <TouchableOpacity key={num} onPress={() => setPlayersPerTeam(num)} style={[styles.optionBtn, playersPerTeam === num && styles.optionBtnActive]}><Text style={[styles.optionBtnText, playersPerTeam === num && {color:'white'}]}>{num}x{num}</Text></TouchableOpacity>
                        ))}
                     </View>
                  </View>

                  <View style={styles.tagsContainer}>
                      {players.map(p => <PlayerTag key={p.id} player={p} onRemove={(id) => setPlayers(prev => prev.filter(x => x.id !== id))} onToggleGender={toggleGender} />)}
                  </View>
                  
                  <TouchableOpacity onPress={handleShuffle} disabled={players.length < 2} style={styles.shuffleBtn}><Shuffle color="white"/><Text style={styles.btnTextWhite}>SORTEAR</Text></TouchableOpacity>
                </>
              )}

              {generatedTeams.length > 0 && draftTeams.length === 0 && !isDrafting && (
                  <View style={{marginTop: 30}}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center'}}>
                          <Text style={styles.labelSmall}>TIMES DEFINIDOS</Text>
                      </View>
                      
                      <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                        <TouchableOpacity onPress={archiveTeams} style={[styles.draftBtn, {backgroundColor: '#2563eb', flex: 1, padding: 10}]}>
                            <Archive color="white" size={18} />
                            <Text style={styles.btnTextWhite}>ARQUIVAR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={clearCurrentTeams} style={[styles.draftBtn, {backgroundColor: '#ef4444', flex: 1, padding: 10}]}>
                            <XCircle color="white" size={18} />
                            <Text style={styles.btnTextWhite}>LIMPAR</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{backgroundColor: 'white', padding: 10}}>
                          {generatedTeams.map((t, i) => (
                            <TouchableOpacity key={i} onPress={() => openRenameModal(t.id, t.codename, false)}>
                              <TeamResultCard index={i} team={t.members} codename={t.codename} onRename={() => openRenameModal(t.id, t.codename, false)} />
                            </TouchableOpacity>
                          ))}
                      </View>
                  </View>
              )}

              <Modal visible={renameModalVisible} transparent animationType="fade">
                <View style={styles.modalContainer}>
                  <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Renomear Time</Text>
                    <TextInput style={styles.renameInput} value={newNameInput} onChangeText={setNewNameInput} autoFocus />
                    <View style={{flexDirection: 'row', gap: 10, marginTop: 15}}>
                      <TouchableOpacity onPress={() => setRenameModalVisible(false)} style={[styles.modalBtn, {backgroundColor: '#ef4444'}]}><Text style={{color: 'white', fontWeight: 'bold'}}>CANCELAR</Text></TouchableOpacity>
                      <TouchableOpacity onPress={saveTeamName} style={[styles.modalBtn, {backgroundColor: '#22c55e'}]}><Text style={{color: 'white', fontWeight: 'bold'}}>SALVAR</Text></TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              <View style={{height:50}}/>
            </ScrollView>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  if (view === 'scoreboard') {
    const isMatchPointA = (scoreA >= mode - 1);
    const isMatchPointB = (scoreB >= mode - 1);
    const activeColor = '#1db954';
    
    return (
      <View style={[styles.container, { backgroundColor: isTieBreak ? '#450a0a' : '#0f172a' }]}>
        <StatusBar barStyle="light-content" />
        
        <Modal visible={showTeamSelector} transparent animationType="slide">
            <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Escolha o Time {selectingFor}</Text>
                    {generatedTeams.length > 0 ? (
                        <FlatList 
                            data={generatedTeams}
                            keyExtractor={item => item.id.toString()}
                            renderItem={({item}) => (
                                <TouchableOpacity onPress={() => selectTeamForScoreboard(item)} style={styles.modalItem}>
                                    <Text style={styles.modalItemTitle}>{item.codename}</Text>
                                    <Text style={styles.modalItemSub}>{item.members.map(m=>m.name).join(', ')}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    ) : (
                        <Text style={{textAlign:'center', marginVertical: 20, color:'#64748b'}}>Nenhum time sorteado ainda. Vá em "Tirar o Time" e salve alguns.</Text>
                    )}
                    <TouchableOpacity onPress={() => setShowTeamSelector(false)} style={styles.modalClose}><Text style={{color:'white', fontWeight:'bold'}}>FECHAR</Text></TouchableOpacity>
                </View>
            </View>
        </Modal>

        <View style={styles.header}>
            <TouchableOpacity onPress={() => setView(category === 'amateur' ? 'amateurHub' : 'proHub')}><ChevronLeft color="white" size={32}/></TouchableOpacity>
            <Text style={[styles.modeText, isTieBreak && {color: '#ef4444'}]}>{isTieBreak ? "VAI A 3" : `${mode} PONTOS`}</Text>
            <TouchableOpacity onPress={startNewMatch}><RotateCcw color="white" size={28}/></TouchableOpacity>
        </View>

        <View style={styles.scoreArea}>
            {/* TIME A */}
            <View style={[styles.scoreCard, { backgroundColor: isMatchPointA && !isTieBreak ? activeColor : '#2563eb' }, winner === 'A' && styles.winnerBorder]}>
                <TouchableOpacity onPress={() => { setSelectingFor('A'); setShowTeamSelector(true); }}>
                    <Text style={styles.teamSub}>{nameTeamA} ✏️</Text>
                </TouchableOpacity>

                {/* Lista Acima */}
                {membersA.length > 0 && (
                    <View style={styles.internalPlayerList}>
                        {membersA.slice(0, Math.ceil(membersA.length / 2)).map((member) => {
                            const points = currentPlayerStats[member.id]?.points || 0;
                            const errors = currentPlayerStats[member.id]?.serveErrors || 0;
                            return (
                                <TouchableOpacity 
                                    key={member.id} 
                                    style={styles.internalPlayerItem} 
                                    onPress={() => !winner && handleAddPlayerPoint('A', member.id)}
                                    onLongPress={() => !winner && handleServeError('A', member.id)} 
                                    delayLongPress={500}
                                >
                                    <Text style={styles.internalPlayerName} numberOfLines={1}>
                                        {errors > 0 && <Text style={{color:'#ef4444', fontSize:8}}>❌{errors} </Text>}
                                        {member.name} 
                                        {points > 0 && <Text style={styles.ballIcon}> ⭐{points}</Text>}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                <View onTouchStart={handleTouchStart} onTouchEnd={(e) => handleTouchEnd(e, 'A')} style={{paddingHorizontal: 20}}>
                    <Text style={[styles.bigNum, membersA.length > 0 && {fontSize: 60, marginVertical: 5}]}>{scoreA}</Text>
                    <Text style={styles.swipeHint}>(↕ Arraste ou Toque)</Text>
                </View>

                {/* Lista Abaixo */}
                {membersA.length > 0 && (
                    <View style={styles.internalPlayerList}>
                        {membersA.slice(Math.ceil(membersA.length / 2)).map((member) => {
                            const points = currentPlayerStats[member.id]?.points || 0;
                            const errors = currentPlayerStats[member.id]?.serveErrors || 0;
                            return (
                                <TouchableOpacity 
                                    key={member.id} 
                                    style={styles.internalPlayerItem} 
                                    onPress={() => !winner && handleAddPlayerPoint('A', member.id)}
                                    onLongPress={() => !winner && handleServeError('A', member.id)}
                                    delayLongPress={500}
                                >
                                    <Text style={styles.internalPlayerName} numberOfLines={1}>
                                        {errors > 0 && <Text style={{color:'#ef4444', fontSize:8}}>❌{errors} </Text>}
                                        {member.name} 
                                        {points > 0 && <Text style={styles.ballIcon}> ⭐{points}</Text>}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </View>

            {/* TIME B */}
            <View style={[styles.scoreCard, { backgroundColor: isMatchPointB && !isTieBreak ? activeColor : '#ea580c' }, winner === 'B' && styles.winnerBorder]}>
                <TouchableOpacity onPress={() => { setSelectingFor('B'); setShowTeamSelector(true); }}>
                    <Text style={styles.teamSub}>{nameTeamB} ✏️</Text>
                </TouchableOpacity>

                {membersB.length > 0 && (
                    <View style={styles.internalPlayerList}>
                        {membersB.slice(0, Math.ceil(membersB.length / 2)).map((member) => {
                            const points = currentPlayerStats[member.id]?.points || 0;
                            const errors = currentPlayerStats[member.id]?.serveErrors || 0;
                            return (
                                <TouchableOpacity 
                                    key={member.id} 
                                    style={styles.internalPlayerItem} 
                                    onPress={() => !winner && handleAddPlayerPoint('B', member.id)}
                                    onLongPress={() => !winner && handleServeError('B', member.id)}
                                    delayLongPress={500}
                                >
                                    <Text style={styles.internalPlayerName} numberOfLines={1}>
                                        {errors > 0 && <Text style={{color:'#ef4444', fontSize:8}}>❌{errors} </Text>}
                                        {member.name} 
                                        {points > 0 && <Text style={styles.ballIcon}> ⭐{points}</Text>}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                <View onTouchStart={handleTouchStart} onTouchEnd={(e) => handleTouchEnd(e, 'B')} style={{paddingHorizontal: 20}}>
                    <Text style={[styles.bigNum, membersB.length > 0 && {fontSize: 60, marginVertical: 5}]}>{scoreB}</Text>
                    <Text style={styles.swipeHint}>(↕ Arraste ou Toque)</Text>
                </View>

                {membersB.length > 0 && (
                    <View style={styles.internalPlayerList}>
                        {membersB.slice(Math.ceil(membersB.length / 2)).map((member) => {
                            const points = currentPlayerStats[member.id]?.points || 0;
                            const errors = currentPlayerStats[member.id]?.serveErrors || 0;
                            return (
                                <TouchableOpacity 
                                    key={member.id} 
                                    style={styles.internalPlayerItem} 
                                    onPress={() => !winner && handleAddPlayerPoint('B', member.id)}
                                    onLongPress={() => !winner && handleServeError('B', member.id)}
                                    delayLongPress={500}
                                >
                                    <Text style={styles.internalPlayerName} numberOfLines={1}>
                                        {errors > 0 && <Text style={{color:'#ef4444', fontSize:8}}>❌{errors} </Text>}
                                        {member.name} 
                                        {points > 0 && <Text style={styles.ballIcon}> ⭐{points}</Text>}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </View>
        </View>

        {showAnimation && <View style={styles.tieBreakOverlay}><Zap color="#facc15" size={100}/><Text style={styles.tieBreakTitle}>Vaaaai a Trees!</Text></View>}
        {winner && (
            <View style={styles.winnerOverlay}>
                <Image source={require('./assets/trophy.png')} style={{width: 150, height: 150, resizeMode:'contain', marginBottom: 20}} />
                <Text style={styles.winnerTitle}>{winner} CAMPEÃO!</Text>
                <Text style={{color: 'rgba(255,255,255,0.7)', marginBottom: 30}}>Fim de Partida. Salvar dados?</Text>
                
                <View style={{width: '100%', gap: 15}}>
                    <TouchableOpacity onPress={saveMatchToStatsAndExit} style={styles.primaryBtn}>
                        <Text style={styles.btnText}>SALVAR ESTATÍSTICAS</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={discardMatchAndExit} style={[styles.primaryBtn, {backgroundColor: '#334155'}]}>
                        <Text style={[styles.btnText, {color: 'white'}]}>DESCARTAR (SAIR)</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )}
      </View>
    );
  }

  // --- NOVA TELA DE ESTATÍSTICAS PRO ---
  if (view === 'stats') {
      return (
          <View style={{flex: 1, backgroundColor: '#0f172a'}}>
              <SafeAreaView style={{flex:1}}>
                  <View style={[styles.headerWhite, { justifyContent: 'space-between', paddingHorizontal: 20 }]}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 15}}>
                        <TouchableOpacity onPress={() => setView('amateurHub')} style={styles.backBtn}><ChevronLeft color="white" size={32}/></TouchableOpacity>
                        <Text style={[styles.titleBlack, {color: 'white'}]}>Estatísticas Pro</Text>
                      </View>
                      
                      {matchStatsDB.length > 0 && (
                        <TouchableOpacity onPress={clearAllStats} style={{padding: 5}}>
                            <Trash2 color="#ef4444" size={24} />
                        </TouchableOpacity>
                      )}
                  </View>
                  <ScrollView contentContainerStyle={{padding: 20}}>
                      {matchStatsDB.length === 0 ? (
                          <Text style={{textAlign: 'center', color: '#64748b', marginTop: 50}}>Nenhuma partida salva ainda.</Text>
                      ) : (
                          matchStatsDB.map((match, idx) => {
                              // Ordenar jogadores pelo número de pontos para o Leaderboard
                              const sortedPlayers = [...(match.allMembers || [])].sort((a, b) => {
                                  const pointsA = match.playerStats[a.id]?.points || 0;
                                  const pointsB = match.playerStats[b.id]?.points || 0;
                                  return pointsB - pointsA;
                              });

                              const topScorer = sortedPlayers.length > 0 ? { 
                                  name: sortedPlayers[0].name, 
                                  points: match.playerStats[sortedPlayers[0].id]?.points || 0 
                              } : { name: '-', points: 0 };
                              
                              let worstServer = { name: '-', errors: 0 };
                              match.allMembers?.forEach(m => {
                                  const pStats = match.playerStats[m.id];
                                  if (pStats?.serveErrors > worstServer.errors) worstServer = { name: m.name, errors: pStats.serveErrors };
                              });

                              return (
                                  <View key={idx} style={styles.proStatsCard}>
                                      {/* Header do Card */}
                                      <View style={styles.proStatsHeader}>
                                          <View style={{flexDirection: 'row', alignItems: 'center', gap: 5}}>
                                              <Clock size={14} color="#94a3b8" />
                                              <Text style={{color: '#94a3b8', fontSize: 12, fontWeight: 'bold'}}>{match.date}</Text>
                                              <Text style={{color: '#475569', fontSize: 12, marginHorizontal: 5}}>•</Text>
                                              <Text style={{color: '#f97316', fontSize: 12, fontWeight: '900'}}>{formatDuration(match.duration)}</Text>
                                          </View>
                                          <View style={styles.winnerBadge}>
                                              <Trophy size={12} color="#0f172a" />
                                              <Text style={{fontSize: 10, fontWeight: 'black', color: '#0f172a', marginLeft: 4}}>VENCEU O {match.winnerTeam}</Text>
                                          </View>
                                      </View>

                                      {/* Placar Final */}
                                      <View style={styles.proStatsScoreRow}>
                                          <Text style={[styles.proStatsTeamName, {textAlign: 'right'}]} numberOfLines={1}>{match.nameTeamA}</Text>
                                          <View style={styles.proStatsScoreBox}>
                                              <Text style={[styles.proStatsScoreNum, {color: '#3b82f6'}]}>{match.scoreA}</Text>
                                              <Text style={{color: 'white', fontWeight: 'bold', marginHorizontal: 5}}>X</Text>
                                              <Text style={[styles.proStatsScoreNum, {color: '#f97316'}]}>{match.scoreB}</Text>
                                          </View>
                                          <Text style={[styles.proStatsTeamName, {textAlign: 'left'}]} numberOfLines={1}>{match.nameTeamB}</Text>
                                      </View>

                                      {/* Destaques (Highlights) */}
                                      <View style={{flexDirection: 'row', gap: 10, marginBottom: 20}}>
                                          <View style={styles.highlightBoxGold}>
                                              <Medal size={20} color="#eab308" style={{marginBottom: 5}}/>
                                              <Text style={{fontSize: 9, color: '#ca8a04', fontWeight: 'bold', uppercase: true}}>MVP da Partida</Text>
                                              <Text style={{fontWeight: 'black', color: '#854d0e', fontSize: 14}} numberOfLines={1}>{topScorer.name}</Text>
                                              <Text style={{fontSize: 10, color: '#ca8a04', fontWeight: 'bold'}}>{topScorer.points} PTS</Text>
                                          </View>
                                          <View style={styles.highlightBoxRed}>
                                              <AlertTriangle size={20} color="#ef4444" style={{marginBottom: 5}}/>
                                              <Text style={{fontSize: 9, color: '#dc2626', fontWeight: 'bold', uppercase: true}}>Mão de Alface</Text>
                                              <Text style={{fontWeight: 'black', color: '#7f1d1d', fontSize: 14}} numberOfLines={1}>{worstServer.name}</Text>
                                              <Text style={{fontSize: 10, color: '#dc2626', fontWeight: 'bold'}}>{worstServer.errors} ERROS</Text>
                                          </View>
                                      </View>

                                      {/* Leaderboard Individual */}
                                      {sortedPlayers.length > 0 && (
                                          <View style={styles.leaderboardContainer}>
                                              <Text style={styles.leaderboardTitle}>DESEMPENHO INDIVIDUAL</Text>
                                              <View style={styles.leaderboardHeader}>
                                                  <Text style={[styles.leaderboardHeaderText, {flex: 2}]}>JOGADOR</Text>
                                                  <Text style={[styles.leaderboardHeaderText, {flex: 1, textAlign: 'center'}]}>PTS ⭐</Text>
                                                  <Text style={[styles.leaderboardHeaderText, {flex: 1, textAlign: 'center'}]}>ERROS ❌</Text>
                                              </View>
                                              {sortedPlayers.map((p, pIdx) => {
                                                  const stats = match.playerStats[p.id] || { points: 0, serveErrors: 0 };
                                                  return (
                                                      <View key={p.id} style={[styles.leaderboardRow, pIdx % 2 === 0 ? {backgroundColor: 'rgba(255,255,255,0.02)'} : null]}>
                                                          <Text style={[styles.leaderboardCell, {flex: 2, fontWeight: 'bold', color: '#e2e8f0'}]} numberOfLines={1}>{p.name}</Text>
                                                          <Text style={[styles.leaderboardCell, {flex: 1, textAlign: 'center', color: '#fbbf24', fontWeight: 'black'}]}>{stats.points}</Text>
                                                          <Text style={[styles.leaderboardCell, {flex: 1, textAlign: 'center', color: stats.serveErrors > 0 ? '#ef4444' : '#64748b'}]}>{stats.serveErrors}</Text>
                                                      </View>
                                                  );
                                              })}
                                          </View>
                                      )}
                                  </View>
                              );
                          })
                      )}
                  </ScrollView>
              </SafeAreaView>
          </View>
      );
  }

  if (view === 'menu') {
      return (
        <View style={styles.menuContainer}>
            <BackgroundVideo />
            <SafeAreaView style={styles.menuContent}>
                <View style={styles.logoBallContainer}>
                    <Image source={require('./assets/bola.png')} style={{ width: 180, height: 180, resizeMode: 'contain' }} />
                </View>
                <Text style={styles.logoMain}>Set<Text style={{color: '#f97316'}}>Point</Text></Text>
                <View style={styles.menuOptions}>
                    <TouchableOpacity onPress={() => { setCategory('amateur'); setView('amateurHub'); }} style={styles.bigActionTransparent}>
                        <Text style={styles.actionTitle}>AMADOR 🏐</Text>
                        <Text style={styles.actionSub}>Sorteio • 15/25 pts • Estatísticas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setCategory('pro'); setView('proHub'); }} style={styles.bigActionTransparent}>
                        <Text style={styles.actionTitle}>PROFISSIONAL 🏆</Text>
                        <Text style={styles.actionSub}>21/25 pts • Sem Sorteio</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
      );
  }
  
  if (view === 'amateurHub') {
      return (
        <View style={styles.menuContainer}>
            <BackgroundVideo />
            <SafeAreaView style={styles.menuContent}>
                <TouchableOpacity onPress={() => setView('menu')} style={styles.backBtnAbsolute}><ChevronLeft color="white" size={32}/></TouchableOpacity>
                <Text style={[styles.logoMain, {fontSize: 30, marginTop: 40}]}>MODO AMADOR</Text>
                <View style={styles.menuOptions}>
                    <Text style={styles.labelSectionWhite}>PLACAR:</Text>
                    <View style={styles.modeRow}>
                        {[15, 25].map(pts => (
                            <TouchableOpacity key={pts} onPress={() => { setMode(pts); startNewMatch(); }} style={styles.optBtnTransparent}>
                                <Text style={styles.optNum}>{pts}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <TouchableOpacity onPress={() => setView('teams')} style={styles.bigActionTransparent}>
                        <Users color="white" size={24}/><Text style={styles.actionTitle}>TIRAR O TIME</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setView('stats')} style={[styles.bigActionTransparent, {backgroundColor: 'rgba(0,0,0,0.8)'}]}>
                        <BarChart3 color="#f97316" size={24}/>
                        <Text style={[styles.actionTitle, {color: '#f97316'}]}>ESTATÍSTICAS</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
      );
  }
  
  if (view === 'proHub') {
      return (
        <View style={styles.menuContainer}>
             <BackgroundVideo />
             <SafeAreaView style={styles.menuContent}>
                <TouchableOpacity onPress={() => setView('menu')} style={styles.backBtnAbsolute}><ChevronLeft color="white" size={32}/></TouchableOpacity>
                <Text style={[styles.logoMain, {fontSize: 30, marginTop: 40}]}>PROFISSIONAL</Text>
                <View style={styles.menuOptions}>
                    <Text style={styles.labelSectionWhite}>PLACAR OFICIAL:</Text>
                    <View style={styles.modeRow}>
                        {[21, 25].map(pts => (
                            <TouchableOpacity key={pts} onPress={() => { setMode(pts); startNewMatch(); }} style={styles.optBtnTransparent}>
                                <Text style={styles.optNum}>{pts}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={{color:'white', textAlign:'center', marginTop: 20, opacity: 0.6}}>Modo profissional sem sorteio e stats.</Text>
                </View>
             </SafeAreaView>
        </View>
      );
  }

  return <View />;
}

const styles = StyleSheet.create({
  startContainer: { flex: 1, backgroundColor: 'white' },
  startContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  startLogoArea: { alignItems: 'center', marginBottom: 60 },
  startBrand: { fontSize: 48, fontWeight: '900', fontStyle: 'italic', color: '#0f172a' },
  startButton: { backgroundColor: '#f97316', width: '100%', height: 65, borderRadius: 35, justifyContent: 'center', alignItems: 'center', shadowColor: '#f97316', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.3, shadowRadius: 15, elevation: 10 },
  startButtonText: { color: 'white', fontWeight: '900', fontSize: 20, letterSpacing: 2 },
  
  menuContainer: { flex: 1, backgroundColor: '#0f172a' },
  menuContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  logoBallContainer: { marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 10 },
  logoMain: { fontSize: 50, fontWeight: '900', fontStyle: 'italic', marginBottom: 40, letterSpacing: -2, color: 'white', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 2, height: 2}, textShadowRadius: 10 },
  menuOptions: { width: '100%', gap: 20 },
  bigActionTransparent: { backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: 25, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', gap: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  actionTitle: { color: 'white', fontSize: 18, fontWeight: '900' },
  actionSub: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold' },
  
  container: { flex: 1, padding: 10 }, 
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 },
  modeText: { color: 'white', fontWeight: '900', letterSpacing: 1 },
  
  scoreArea: { flex: 1, flexDirection: 'row', gap: 10, marginVertical: 20 },
  scoreCol: { flex: 1 },
  scoreCard: { flex: 1, borderRadius: 25, alignItems: 'center', justifyContent: 'space-between', elevation: 10, paddingVertical: 10, overflow: 'hidden' }, 
  bigNum: { color: 'white', fontSize: 80, fontWeight: '900', marginVertical: 5, textAlign: 'center' },
  swipeHint: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 'bold', textAlign: 'center', marginTop: -5, marginBottom: 5 },
  teamSub: { color: 'white', opacity: 0.9, fontSize: 12, fontWeight: 'bold', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginBottom: 5 },
  winnerBorder: { borderWidth: 8, borderColor: '#fbbf24' },
  
  internalPlayerList: { width: '100%', paddingHorizontal: 5 },
  internalPlayerItem: { backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 2, padding: 6, borderRadius: 6, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  internalPlayerName: { color: 'white', fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  ballIcon: { fontSize: 10 },
  ballCount: { fontSize: 8, color: '#fbbf24', fontWeight: 'bold', marginLeft: 2 },
  
  internalMinusBtn: { backgroundColor: 'rgba(0,0,0,0.3)', width: '100%', padding: 10, alignItems: 'center', marginTop: 'auto' },
  minusLabel: { color: 'white', opacity: 0.8, fontWeight: 'bold', fontSize: 12 },

  tieBreakOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#facc15', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  tieBreakTitle: { fontSize: 45, fontWeight: '900', color: '#0f172a', fontStyle: 'italic' },
  winnerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 40 },
  winnerTitle: { color: 'white', fontSize: 32, fontWeight: '900', textAlign: 'center', marginVertical: 20 },
  primaryBtn: { backgroundColor: '#fbbf24', width: '100%', padding: 22, borderRadius: 25, alignItems: 'center' },
  btnText: { fontWeight: '900', fontSize: 16 },
  
  headerWhite: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 20, marginTop: 10, paddingHorizontal: 20 },
  titleBlack: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
  backBtn: { padding: 10, marginLeft: -10 },
  cardInput: { backgroundColor: '#f8fafc', padding: 20, borderRadius: 25, borderWidth: 1, borderColor: '#e2e8f0' },
  labelSmall: { fontSize: 10, fontWeight: '900', color: '#94a3b8', marginBottom: 5 },
  toggleText: { color: '#2563eb', fontSize: 10, fontWeight: 'bold', textDecorationLine: 'underline' },
  inputField: { backgroundColor: 'white', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  addPlayerBtn: { backgroundColor: '#2563eb', padding: 15, borderRadius: 15, marginTop: 15, flexDirection: 'row', justifyContent: 'center', gap: 10, alignItems: 'center' },
  btnTextWhite: { color: 'white', fontWeight: '900' },
  sectionContainer: { marginVertical: 20 },
  rowGap: { flexDirection: 'row', gap: 10 },
  optionBtn: { flex: 1, padding: 15, backgroundColor: '#f8fafc', borderRadius: 15, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  optionBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  optionBtnText: { fontWeight: 'bold', color: '#94a3b8' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  playerTag: { backgroundColor: 'white', paddingLeft: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', width: '48%', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  playerTagFemale: { borderColor: '#d946ef', backgroundColor: '#fdf4ff' },
  playerTagName: { fontWeight: 'bold', fontSize: 13, color: '#1e293b', flex: 1 },
  deleteArea: { padding: 12, borderLeftWidth: 1, borderLeftColor: '#f1f5f9' },
  shuffleBtn: { backgroundColor: '#0f172a', padding: 20, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', gap: 10, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  teamResultCard: { backgroundColor: 'rgba(239, 246, 255, 0.95)', padding: 20, borderRadius: 25, marginTop: 10, borderWidth: 1, borderColor: '#dbeafe' },
  teamHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  teamResultLabel: { fontSize: 10, color: '#2563eb', fontWeight: '900' },
  teamResultMembers: { fontSize: 16, fontWeight: 'bold', color: '#1e3a8a' },
  
  labelSectionWhite: { fontSize: 10, fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  modeRow: { flexDirection: 'row', gap: 10 },
  optBtnTransparent: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', padding: 20, borderRadius: 25, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  optNum: { fontSize: 24, fontWeight: '900', color: 'white' },
  backBtnAbsolute: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  mixedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, backgroundColor: '#94a3b8' },
  
  draftContainer: { backgroundColor: '#fff7ed', padding: 20, borderRadius: 20, marginBottom: 30, borderWidth: 1, borderColor: '#fdba74' },
  draftTitle: { color: '#c2410c', fontWeight: '900', textAlign: 'center', marginBottom: 15 },
  draftActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  draftBtn: { flex: 1, padding: 15, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },

  draftingOverlay: { backgroundColor: '#f8fafc', padding: 20, borderRadius: 30, alignItems: 'center', minHeight: 400, borderWidth: 2, borderColor: '#e2e8f0' },
  draftingTitle: { fontSize: 14, fontWeight: '900', color: '#94a3b8', marginBottom: 20, letterSpacing: 2 },
  currentPlayerCard: { backgroundColor: '#0f172a', width: '100%', padding: 30, borderRadius: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.2, shadowRadius: 15, elevation: 10, minHeight: 120, justifyContent: 'center' },
  draftingName: { fontSize: 28, fontWeight: 'black', color: 'white', textTransform: 'uppercase', textAlign: 'center' },
  draftingDestination: { fontSize: 12, fontWeight: 'bold', color: '#94a3b8', marginTop: 10, textTransform: 'uppercase' },
  skipButton: { marginTop: 30, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  skipButtonText: { color: '#64748b', fontWeight: '900', fontSize: 12 },
  
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  modalContent: { width: '85%', maxHeight: '70%', backgroundColor: 'white', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 20 },
  modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  modalItemTitle: { fontSize: 16, fontWeight: '900', color: '#2563eb' },
  modalItemSub: { fontSize: 12, color: '#64748b' },
  modalClose: { marginTop: 20, backgroundColor: '#0f172a', padding: 15, borderRadius: 10, alignItems: 'center' },
  renameInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 15 },
  modalBtn: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },

  // ESTATÍSTICAS PRO
  proStatsCard: { backgroundColor: '#1e293b', borderRadius: 25, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: {width:0, height:5}, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  proStatsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: 15, marginBottom: 20 },
  winnerBadge: { backgroundColor: '#facc15', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  proStatsScoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  proStatsTeamName: { flex: 1, fontSize: 16, fontWeight: '900', color: 'white', textTransform: 'uppercase' },
  proStatsScoreBox: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  proStatsScoreNum: { fontSize: 36, fontWeight: 'black' },
  highlightBoxGold: { flex: 1, backgroundColor: '#fefce8', padding: 15, borderRadius: 15, alignItems: 'center' },
  highlightBoxRed: { flex: 1, backgroundColor: '#fef2f2', padding: 15, borderRadius: 15, alignItems: 'center' },
  leaderboardContainer: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 15, padding: 15 },
  leaderboardTitle: { fontSize: 10, fontWeight: 'black', color: '#94a3b8', letterSpacing: 2, marginBottom: 10, textAlign: 'center' },
  leaderboardHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: 5, marginBottom: 5 },
  leaderboardHeaderText: { fontSize: 9, fontWeight: 'bold', color: '#64748b' },
  leaderboardRow: { flexDirection: 'row', paddingVertical: 8, alignItems: 'center' },
  leaderboardCell: { fontSize: 12 }
});