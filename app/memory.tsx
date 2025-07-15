import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, FlatList, Image, ActivityIndicator, SafeAreaView } from 'react-native';

interface Card {
  id: number;
  pokemonId: number;
  name: string;
  sprite: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const POKEMON_API_BASE_URL = 'https://pokeapi.co/api/v2/pokemon/';
const TOTAL_POKEMON = 898;
const PAIRS_COUNT = 10; 
const shuffleArray = (array: any[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

export default function MemoryGameScreen() {
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [isGameWon, setIsGameWon] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const setupGame = useCallback(async () => {
    setIsLoading(true);
    setCards([]);
    setFlippedCards([]);
    setMoves(0);
    setIsGameWon(false);
    try {
      const randomIds = new Set<number>();
      while (randomIds.size < PAIRS_COUNT) {
        randomIds.add(Math.floor(Math.random() * TOTAL_POKEMON) + 1);
      }
      const promises = Array.from(randomIds).map(id => fetch(`${POKEMON_API_BASE_URL}${id}`).then(res => res.json()));
      const pokemonData = await Promise.all(promises);
      let cardIdCounter = 0;
      const gameCards: Card[] = pokemonData.flatMap(pokemon => {
        const cardBase = {
          pokemonId: pokemon.id,
          name: pokemon.name,
          sprite: pokemon.sprites.front_default,
          isFlipped: false,
          isMatched: false,
        };
        return [
          { ...cardBase, id: cardIdCounter++ },
          { ...cardBase, id: cardIdCounter++ },
        ];
      });

      setCards(shuffleArray(gameCards));
    } catch (error) {
      console.error("Erro ao preparar o jogo:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    setupGame();
  }, [setupGame]);
  useEffect(() => {
    if (flippedCards.length === 2) {
      const [firstCardIndex, secondCardIndex] = flippedCards;
      const firstCard = cards[firstCardIndex];
      const secondCard = cards[secondCardIndex];
      if (firstCard.pokemonId === secondCard.pokemonId) {
        setCards(prevCards =>
          prevCards.map((card, index) =>
            index === firstCardIndex || index === secondCardIndex ? { ...card, isMatched: true } : card
          )
        );
        setFlippedCards([]);
      } else {
        setTimeout(() => {
          setCards(prevCards =>
            prevCards.map((card, index) =>
              index === firstCardIndex || index === secondCardIndex ? { ...card, isFlipped: false } : card
            )
          );
          setFlippedCards([]);
        }, 1000);
      }
    }
  }, [flippedCards, cards]);
  useEffect(() => {
    if (cards.length > 0 && cards.every(card => card.isMatched)) {
      setIsGameWon(true);
    }
  }, [cards]);
  const handleCardFlip = (index: number) => {
    if (flippedCards.length === 2 || cards[index].isFlipped) {
      return;
    }

    setMoves(prev => prev + 1);
    setCards(prevCards =>
      prevCards.map((card, i) => (i === index ? { ...card, isFlipped: true } : card))
    );
    setFlippedCards(prev => [...prev, index]);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text>A preparar as cartas...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.movesText}>Jogadas: {Math.floor(moves / 2)}</Text>
      </View>

      <FlatList
        data={cards}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.card, item.isFlipped ? styles.cardFlipped : styles.cardDown]}
            onPress={() => handleCardFlip(index)}
            disabled={item.isFlipped}
          >
            {item.isFlipped ? (
              <Image source={{ uri: item.sprite }} style={styles.sprite} />
            ) : (
              <Image source={require('../assets/R.png')} style={styles.pokeball} />
            )}
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id.toString()}
        numColumns={4}
        contentContainerStyle={styles.list}
      />

      {isGameWon && (
        <View style={styles.winOverlay}>
          <Text style={styles.winText}>Parabéns!</Text>
          <Text style={styles.winSubText}>Você encontrou todos os pares!</Text>
          <TouchableOpacity style={styles.playAgainButton} onPress={setupGame}>
            <Text style={styles.playAgainText}>Jogar Novamente</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8F5E9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 15, alignItems: 'center' },
  movesText: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  list: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  card: {
    width: 80, height: 100, margin: 5,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: 10, borderWidth: 2,
  },
  cardDown: {
    backgroundColor: '#A5D6A7', borderColor: '#66BB6A',
  },
  cardFlipped: {
    backgroundColor: '#FFF', borderColor: '#4CAF50',
  },
  pokeball: { width: 50, height: 50 },
  sprite: { width: 70, height: 70 },
  winOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  winText: { fontSize: 48, fontWeight: 'bold', color: '#FFCB05' },
  winSubText: { fontSize: 18, color: 'white', marginBottom: 30 },
  playAgainButton: {
    backgroundColor: '#4CAF50', paddingVertical: 15,
    paddingHorizontal: 30, borderRadius: 15,
  },
  playAgainText: { fontSize: 20, color: 'white', fontWeight: 'bold' },
});
