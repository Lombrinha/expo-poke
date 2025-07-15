import { Stack } from 'expo-router';
import React from 'react';

export default function AppLayout() {
  return (
    <Stack>
      {/* Rota do menu principal */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      
      {/* Ecrãs dos jogos e da Pokédex */}
      <Stack.Screen name="game" options={{ headerShown: false }} />
      <Stack.Screen 
        name="pokedex" 
        options={{ 
          title: 'Pokédex',
          headerStyle: { backgroundColor: '#CC0000' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
      <Stack.Screen 
        name="memory" 
        options={{ 
          title: 'Jogo da Memória',
          headerStyle: { backgroundColor: '#4CAF50' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
      <Stack.Screen 
        name="race" 
        options={{ 
          title: 'Corrida de Pokémon',
          headerStyle: { backgroundColor: '#f44336' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
      {/* NOVO: Ecrã da Rinha de Pokémon */}
      <Stack.Screen 
        name="battle" 
        options={{ 
          title: 'Rinha de Pokémon',
          headerStyle: { backgroundColor: '#212121' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
    </Stack>
  );
}
