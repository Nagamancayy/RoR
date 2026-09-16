import time
import os
import binascii

# --- Constants & Helpers (Same as Encryptor) ---
IV_V3 = [
    0x6a09e667f3bcc908, 0xbb67ae8584caa73b,
    0x3c6ef372fe94f82b, 0xa54ff53a5f1d36f1,
    0x510e527fade682d1, 0x9b05688c2b3e6c1f,
    0x1f83d9abfb41bd6b, 0x5be0cd19137e2179,
    0x0, 0x0, 0x0, 0x0,
    0x0, 0x0, 0x0, 0x0
]
sigma = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
    [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
    [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
    [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
    [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
    [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
    [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
    [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
    [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]
]

def rotr(x, n): return ((x >> n) | (x << (64 - n))) & 0xFFFFFFFFFFFFFFFF

def G(v, a, b, c, d, m, n, j, k):
    v[a] = (v[a] + v[b] + (m[j] ^ n[k])) & 0xFFFFFFFFFFFFFFFF
    v[d] = rotr(v[d] ^ v[a], 32)
    v[c] = (v[c] + v[d]) & 0xFFFFFFFFFFFFFFFF
    v[b] = rotr(v[b] ^ v[c], 24)
    v[a] = (v[a] + v[b] + (m[k] ^ n[j])) & 0xFFFFFFFFFFFFFFFF
    v[d] = rotr(v[d] ^ v[a], 16)
    v[c] = (v[c] + v[d]) & 0xFFFFFFFFFFFFFFFF
    v[b] = rotr(v[b] ^ v[c], 63)

def compress(v, m, n, sigma):
    for r in range(10):
        G(v, 0, 4, 8, 12, m, n, sigma[r][0], sigma[r][1])
        G(v, 1, 5, 9, 13, m, n, sigma[r][2], sigma[r][3])
        G(v, 2, 6, 10, 14, m, n, sigma[r][4], sigma[r][5])
        G(v, 3, 7, 11, 15, m, n, sigma[r][6], sigma[r][7])
        G(v, 0, 5, 10, 15, m, n, sigma[r][8], sigma[r][9])
        G(v, 1, 6, 11, 12, m, n, sigma[r][10], sigma[r][11])
        G(v, 2, 7, 8, 13, m, n, sigma[r][12], sigma[r][13])
        G(v, 3, 4, 9, 14, m, n, sigma[r][14], sigma[r][15])

def ambil_256_bit_awal(kunci):
    while len(kunci) < 32: kunci += kunci
    return ''.join(format(ord(c), '08b') for c in kunci[:32])[:256]

def remove_padding(data):
    padding_length = data[-1]
    if padding_length < 1 or padding_length > len(data): return data 
    return data[:-padding_length]

def keystream_generator(state_16_ints):
    while True:
        for val64 in state_16_ints:
            bytes_val = val64.to_bytes(8, byteorder='big')
            for b in bytes_val:
                yield b

def get_key_session_state(kunci_str, salt_ints):
    local_iv = list(IV_V3)
    kunci_bits = ambil_256_bit_awal(kunci_str)
    key_ints = [int(kunci_bits[i*64:(i+1)*64], 2) for i in range(4)]
    
    for i in range(4): local_iv[8+i], local_iv[12+i] = salt_ints[i], key_ints[i]
    
    key_bytes = kunci_str.encode('utf-8')
    n_const = list(local_iv)
    v = list(local_iv)
    
    num_blocks = (len(key_bytes) + 127) // 128
    for i in range(num_blocks):
        block = key_bytes[i*128:(i+1)*128]
        if len(block) < 128: block = block.ljust(128, b'\0')
        
        block_bits = ''.join(format(b, '08b') for b in block)
        block_bits_1024 = (block_bits * 4)[:1024]
        m = [int(block_bits_1024[j*64:(j+1)*64], 2) for j in range(16)]
        
        compress(v, m, n_const, sigma)
        
    return v

def process_message_hash(pesan_padded_bytes, iv_state):
    v = list(iv_state)
    n = list(iv_state)
    
    num_blocks = (len(pesan_padded_bytes) + 127) // 128
    final_states = []
    
    for i in range(num_blocks):
        block = pesan_padded_bytes[i*128:(i+1)*128]
        if len(block) < 128: block = block.ljust(128, b'\0')
        
        block_bits = ''.join(format(b, '08b') for b in block)
        block_bits_1024 = (block_bits * 4)[:1024]
        m = [int(block_bits_1024[j*64:(j+1)*64], 2) for j in range(16)]
        
        compress(v, m, n, sigma)
        final_states.append(list(v))
        
    return final_states

if __name__ == "__main__":
    print("\n--- DEKRIPSI V3.4 (THESIS FINAL) ---")
    
    hex_input = input("Masukkan Output Hex (Dari V3.4): ")
    kunci = input("Masukkan kunci: ")
    
    start_time = time.perf_counter()

    try:
        full_payload = binascii.unhexlify(hex_input.strip())
        
        if len(full_payload) < 160:
            raise ValueError("Payload too short (header missing)")
            
        tag_bytes = full_payload[0:128]
        salt_bytes = full_payload[128:160]
        cipher_bytes = full_payload[160:]
        
        salt_ints = []
        for i in range(4):
            chunk = salt_bytes[i*8:(i+1)*8]
            salt_ints.append(int.from_bytes(chunk, 'big'))
            
        received_tag = []
        for i in range(16):
            chunk = tag_bytes[i*8:(i+1)*8]
            received_tag.append(int.from_bytes(chunk, 'big'))
        
        # 1. Recovery Session State from Salt & Key
        session_state = get_key_session_state(kunci, salt_ints)
        IV_val = list(session_state) # Copy for manipulation
        
        # 2. Recover Salt Prime (New Logic: from_bytes)
        generator_number = IV_val[8:12]
        
        # OLD: bin string concat (REMOVED)
        # generator_number_bin = ...
        
        # NEW: Stable from_bytes logic
        generator_bytes = b"".join(x.to_bytes(8, 'big') for x in generator_number)
        salt_prime = int.from_bytes(generator_bytes, 'big')
        
        # 3. Synchronize State (Mirror Encryptor Logic)
        retries = 0
        while salt_prime % 64 == 0 and retries < 100:
            # Mutate IV (State Shift)
            IV_val[8] = (IV_val[8] + 1) & 0xFFFFFFFFFFFFFFFF
            
            # Recalculate using new IV state
            generator_number = IV_val[8:12]
            generator_bytes = b"".join(x.to_bytes(8, 'big') for x in generator_number)
            salt_prime = int.from_bytes(generator_bytes, 'big')
            retries += 1
            
        # 4. Initialize Keystream AFTER Sync
        keystream_gen = keystream_generator(IV_val)
        
        route = salt_prime % 4
        determinant = salt_prime % 2
        randomindex = {1:2, 2:3, 0:5}.get(route, 7)
        
        # 5. Decryption Loop
        decrypted_bytes = bytearray()
        counter = 1
        
        for current_cipher in cipher_bytes:
            curr_k = next(keystream_gen)
            
            product = salt_prime * counter
            m_val = ((product ^ (product >> 16)) & 0xFF) | 1
            
            if determinant == 0:
                if counter % randomindex == 0: res = (current_cipher + curr_k * m_val) % 256
                else: res = (current_cipher - curr_k * m_val) % 256
            else:
                if counter % randomindex == 0: res = (current_cipher - curr_k * m_val) % 256
                else: res = (current_cipher + curr_k * m_val) % 256
            
            decrypted_bytes.append(int(res))
            counter += 1
            
        pesan_bytes = bytes(decrypted_bytes)
        pesanakhir = remove_padding(pesan_bytes).decode('latin-1')
        print(f"\nPesan Asli: {pesanakhir}")
        
        # 6. Integrity Verification
        # Note: process_message_hash uses session_state. 
        # In Encryptor, Hash is calculated BEFORE modification of IV (line 147).
        # But wait. line 147 'final_states_msg = process_message(pesan_padded)'. 
        # process_message uses GLOBAL IV inside itself? 
        # Encryptor Line 91: 'v_initial = [IV[i] for i in range(16)]'
        # In Encryptor V3.4:
        # line 131: IV = list(state_session)  <-- IV set to session state
        # line 147: process_message(pesan_padded) called. It uses CURRENT IV (session state).
        # line 150-163: IV is mutated (Weak Salt Check).
        
        # So Hash (Tag) was created based on Initial Session State (Before Mutation).
        # Decryptor check:
        # We need to verify hash using 'session_state' (The initial one), NOT 'IV_val' (The mutated one).
        
        final_states_calc = process_message_hash(pesan_bytes, session_state)
        calculated_tag = final_states_calc[-1]
        
        verified = True
        if len(calculated_tag) != len(received_tag): verified = False
        else:
            for s1, s2 in zip(calculated_tag, received_tag):
                if s1 != s2: 
                    verified = False
                    break
        
        if verified:
            print("Verifikasi Integritas: SUKSES (Tag Cocok) ✅")
        else:
            print("Verifikasi Integritas: GAGAL (Tag Mismatch) ❌")
            
    except Exception as e:
        print(f"Error: {e}")
        # import traceback
        # traceback.print_exc()
        exit(1)
        
    end_time = time.perf_counter()
    print(f"Time: {(end_time-start_time)*1000:.4f} ms")
