import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, ActivityIndicator, SafeAreaView, Dimensions, Animated } from 'react-native';

// --- Tipos ---
interface Stat { base_stat: number; stat: { name: string }; }
interface Racer {
  id: number;
  name: string;
  sprite: string;
  progress: Animated.Value;
  speed: number; // Atributo de velocidade
}

const POKEMON_API_BASE_URL = 'https://pokeapi.co/api/v2/pokemon/';
const TOTAL_POKEMON = 898;
const RACERS_COUNT = 6;
const BETTING_TIME_SECONDS = 6;
const { width } = Dimensions.get('window');

export default function RaceScreen() {
  const [racers, setRacers] = useState<Racer[]>([]);
  const [gameState, setGameState] = useState<'loading' | 'betting' | 'racing' | 'finished'>('loading');
  const [bettingTime, setBettingTime] = useState(BETTING_TIME_SECONDS);
  const [selectedPokemonId, setSelectedPokemonId] = useState<number | null>(null);
  const [winner, setWinner] = useState<Racer | null>(null);
  const [resultText, setResultText] = useState('');
  
  const bettingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Função para preparar a corrida
  const setupRace = useCallback(async () => {
    setGameState('loading');
    setWinner(null);
    setSelectedPokemonId(null);
    setResultText('');

    // CORREÇÃO: Limpa o estado das animações anteriores antes de começar uma nova corrida.
    racers.forEach(racer => {
        racer.progress.stopAnimation();
        racer.progress.removeAllListeners();
    });

    try {
      const randomIds = new Set<number>();
      while (randomIds.size < RACERS_COUNT) {
        randomIds.add(Math.floor(Math.random() * TOTAL_POKEMON) + 1);
      }

      const promises = Array.from(randomIds).map(id => fetch(`${POKEMON_API_BASE_URL}${id}`).then(res => res.json()));
      const pokemonData = await Promise.all(promises);

      const newRacers: Racer[] = pokemonData.map(pokemon => {
        const speedStat = pokemon.stats.find((s: Stat) => s.stat.name === 'speed').base_stat;
        return {
          id: pokemon.id,
          name: pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1),
          sprite: pokemon.sprites.front_default,
          progress: new Animated.Value(0),
          speed: speedStat,
        };
      });

      setRacers(newRacers);
      setGameState('betting');
    } catch (error) {
      console.error("Erro ao preparar a corrida:", error);
      setResultText('Não foi possível carregar os Pokémon. Tente novamente.');
    }
  }, [racers]); // Adicionado 'racers' à dependência para garantir que a limpeza funciona com o estado mais recente.

  // Inicia a corrida na primeira renderização
  useEffect(() => {
    setupRace();
  }, []); // Removido setupRace das dependências para evitar loop, já que ele agora depende de 'racers'.

  // Lógica para a contagem regressiva da aposta
  useEffect(() => {
    if (gameState === 'betting') {
      setBettingTime(BETTING_TIME_SECONDS);
      bettingIntervalRef.current = setInterval(() => {
        setBettingTime(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (bettingIntervalRef.current) {
        clearInterval(bettingIntervalRef.current);
      }
    };
  }, [gameState]);

  // Inicia a corrida quando o tempo de aposta acaba
  useEffect(() => {
    if (bettingTime === 0 && gameState === 'betting') {
      if (bettingIntervalRef.current) clearInterval(bettingIntervalRef.current);
      setGameState('racing');
    }
  }, [bettingTime, gameState]);

  // Lógica da corrida
  useEffect(() => {
    if (gameState === 'racing') {
      let raceWinner: Racer | null = null;
      const animations = racers.map(racer => {
        const baseDuration = 12000;
        const speedFactor = 50;
        const randomFactor = Math.random() * 1000;
        const duration = Math.max(4000, baseDuration - (racer.speed * speedFactor) + randomFactor);

        racer.progress.addListener(({ value }) => {
          if (value === 100 && !raceWinner) {
            raceWinner = racer;
            setWinner(raceWinner);
            setGameState('finished');
            animations.forEach(anim => anim.stop());
          }
        });

        return Animated.timing(racer.progress, {
          toValue: 100,
          duration: duration,
          useNativeDriver: false,
        });
      });

      Animated.parallel(animations).start();
    }
    
    // CORREÇÃO: Adiciona uma função de limpeza para remover os listeners e evitar memory leaks.
    return () => {
        racers.forEach(racer => racer.progress.removeAllListeners());
    };
  }, [gameState, racers]);

  // Mostra o resultado final
  useEffect(() => {
    if (gameState === 'finished' && winner) {
      if (selectedPokemonId === null) {
        setResultText(`Você não apostou! ${winner.name} venceu a corrida!`);
      } else if (winner.id === selectedPokemonId) {
        setResultText(`Parabéns! Você apostou em ${winner.name} e venceu!`);
      } else {
        setResultText(`Que pena! Você perdeu. ${winner.name} foi o vencedor!`);
      }
    }
  }, [gameState, winner, selectedPokemonId]);


  const renderBettingOverlay = () => (
    <View style={styles.overlay}>
      <Text style={styles.overlayTitle}>Faça a sua aposta!</Text>
      <Text style={styles.timerText}>{bettingTime}</Text>
      <View style={styles.racersContainer}>
        {racers.map(racer => (
          <TouchableOpacity 
            key={racer.id} 
            style={[styles.racerCard, selectedPokemonId === racer.id && styles.selectedCard]}
            onPress={() => setSelectedPokemonId(racer.id)}
          >
            <Image source={{ uri: racer.sprite }} style={styles.racerSprite} />
            <Text style={styles.racerName}>{racer.name}</Text>
            <Text style={styles.speedText}>Vel: {racer.speed}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderFinishedOverlay = () => (
    <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>Corrida Terminada!</Text>
        {winner && <Image source={{ uri: winner.sprite }} style={styles.winnerSprite} />}
        <Text style={styles.resultText}>{resultText}</Text>
        <TouchableOpacity style={styles.playAgainButton} onPress={setupRace}>
            <Text style={styles.playAgainText}>Correr Novamente</Text>
        </TouchableOpacity>
    </View>
  );


  return (
    <SafeAreaView style={styles.container}>
      {gameState === 'loading' && <ActivityIndicator size="large" color="#f44336" />}

      {racers.length > 0 && (
        <View style={styles.trackContainer}>
          {racers.map(racer => (
            <View key={racer.id} style={styles.track}>
              <Animated.View style={{ transform: [{ 
                  translateX: racer.progress.interpolate({
                    inputRange: [0, 100],
                    outputRange: [0, width - 80] // width - (padding + sprite size)
                  }) 
              }] }}>
                <Image source={{ uri: racer.sprite }} style={styles.racingSprite} />
              </Animated.View>
              <View style={styles.finishLine} />
            </View>
          ))}
        </View>
      )}

      {gameState === 'betting' && renderBettingOverlay()}
      {gameState === 'finished' && renderFinishedOverlay()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDE7', justifyContent: 'center', alignItems: 'center' },
  trackContainer: { width: '100%', paddingVertical: 20 },
  track: { height: 60, borderBottomWidth: 2, borderBottomColor: '#D2B48C', justifyContent: 'center' },
  racingSprite: { width: 50, height: 50, resizeMode: 'contain' },
  finishLine: { position: 'absolute', right: 10, top: 0, bottom: 0, width: 5, backgroundColor: '#f44336' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  overlayTitle: { fontSize: 32, fontWeight: 'bold', color: 'white', marginBottom: 20, textAlign: 'center' },
  timerText: { fontSize: 48, fontWeight: 'bold', color: '#FFCB05', marginBottom: 20 },
  racersContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  racerCard: { margin: 5, padding: 10, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', borderWidth: 3, borderColor: 'transparent' },
  selectedCard: { borderColor: '#FFCB05' },
  racerSprite: { width: 70, height: 70 },
  racerName: { fontWeight: 'bold', fontSize: 12 },
  speedText: { fontSize: 10, color: '#666' },
  winnerSprite: { width: 150, height: 150, marginBottom: 20 },
  resultText: { fontSize: 22, color: 'white', textAlign: 'center', marginBottom: 30, paddingHorizontal: 10 },
  playAgainButton: { backgroundColor: '#f44336', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 15 },
  playAgainText: { fontSize: 20, color: 'white', fontWeight: 'bold' },
});
