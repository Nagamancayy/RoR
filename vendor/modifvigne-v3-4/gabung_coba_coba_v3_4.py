import time
import os
import binascii

# --- Constants & Helpers (Standard V3) ---
IV = [
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

def ambil_256_bit_awal(kunci):
    while len(kunci) < 32: kunci += kunci
    return ''.join(format(ord(c), '08b') for c in kunci[:32])[:256]

def rotr(x, n): return ((x >> n) | (x << (64 - n))) & 0xFFFFFFFFFFFFFFFF

def G(v, a, b, c, d, m, n, j, k):
    n_global = IV[:] 
    v[a] = (v[a] + v[b] + (m[j] ^ n_global[k])) & 0xFFFFFFFFFFFFFFFF
    v[d] = rotr(v[d] ^ v[a], 32)
    v[c] = (v[c] + v[d]) & 0xFFFFFFFFFFFFFFFF
    v[b] = rotr(v[b] ^ v[c], 24)
    v[a] = (v[a] + v[b] + (m[k] ^ n_global[j])) & 0xFFFFFFFFFFFFFFFF
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

def generate_random_bits():
    # V3.3 Original Generator (Linear Transform)
    # Keeping this as requested (Algorithm Logic)
    random_bits = ''
    a = 0.5
    D = 131
    for _ in range(256):
        H = int.from_bytes(os.urandom(4), byteorder="big")
        M = ((D / a) - a) / 2
        S = int(a * H + M + D)
        random_bits += str(S % 2)
    return random_bits, int(random_bits, 2), S

def initialize_salt_from_random_bits():
    random_bits, _, _ = generate_random_bits()
    salt = []
    for i in range(4):
        salt.append(int(random_bits[i*64:(i+1)*64], 2))
    return salt

def add_padding(data, block_size):
    padding_length = block_size - (len(data) % block_size)
    base_val = int.from_bytes(os.urandom(2), 'big') % 128
    
    padding = []
    for i in range(padding_length - 1):
        padding.append((base_val + int.from_bytes(os.urandom(2), 'big')) % 128)
    padding.append(padding_length)
    return data + bytes(padding)

def remove_padding(data):
    padding_length = data[-1]
    if padding_length < 1 or padding_length > len(data): raise ValueError("Invalid Padding")
    return data[:-padding_length]

def process_message(message):
    if isinstance(message, str): message = message.encode()
    v_initial = [IV[i] for i in range(16)]
    num_blocks = (len(message) + 127) // 128
    final_states = []
    
    for i in range(num_blocks):
        v = v_initial[:]
        block = message[i*128:(i+1)*128]
        if len(block) < 128: block = block.ljust(128, b'\0')
        
        bit_string = ''.join(format(b, '08b') for b in block)
        bit_string_1024 = (bit_string * 4)[:1024]
        
        m = [int(bit_string_1024[j*64:(j+1)*64], 2) for j in range(16)]
        n = IV[:]
        compress(v, m, n, sigma)
        v_initial = v[:]
    final_states.append(v[:])
    return final_states

def keystream_generator(state_16_ints):
    while True:
        for val64 in state_16_ints:
            bytes_val = val64.to_bytes(8, byteorder='big')
            for b in bytes_val:
                yield b

# --- V3.4 Encryptor (The Thesis Final Version) ---

def encrypt_v3_4(pesan_str, kunci_str):
    global IV
    IV[:] = [
        0x6a09e667f3bcc908, 0xbb67ae8584caa73b,
        0x3c6ef372fe94f82b, 0xa54ff53a5f1d36f1,
        0x510e527fade682d1, 0x9b05688c2b3e6c1f,
        0x1f83d9abfb41bd6b, 0x5be0cd19137e2179,
        0x0, 0x0, 0x0, 0x0,
        0x0, 0x0, 0x0, 0x0
    ]

    # 1. Key Hashing
    kunci_256bit = ambil_256_bit_awal(kunci_str)
    Salt = initialize_salt_from_random_bits()
    key_ints = [int(kunci_256bit[i*64:(i+1)*64], 2) for i in range(4)]
    for i in range(4): IV[8 + i], IV[12 + i] = Salt[i], key_ints[i]
    
    final_states_key = process_message(kunci_str)
    state_session = final_states_key[-1]
    IV = list(state_session)

    # Note: Keystream initialization MOVED to after Salt Prime adjustment (FIX POINT 2)
    # to ensure synchronization if IV is mutated.

    # 3. Message Processing
    pesan_padded = add_padding(pesan_str.encode(), 128)
    
    # Tag Generation (Hash Padded Message)
    final_states_msg = process_message(pesan_padded)
    tag_state = final_states_msg[-1] 
    
    # 4. Salt Prime Calc - Improved Stability (FIX POINT 1)
    generator_number = IV[8:12]
    
    # OLD: Bin string concat (Variable Length Issue)
    # generator_number_bin = [bin(x) for x in generator_number] ...
    
    # NEW: Fixed length bytes concatenation (Stable 256-bit structure)
    generator_bytes = b"".join(x.to_bytes(8, 'big') for x in generator_number)
    salt_prime = int.from_bytes(generator_bytes, 'big')
    
    # Weak Salt Check (Loop)
    retries = 0
    while salt_prime % 64 == 0 and retries < 100:
        # Mutate IV (State Shift)
        IV[8] = (IV[8] + 1) & 0xFFFFFFFFFFFFFFFF
        
        # Recalculate using new IV state
        generator_number = IV[8:12]
        generator_bytes = b"".join(x.to_bytes(8, 'big') for x in generator_number)
        salt_prime = int.from_bytes(generator_bytes, 'big')
        retries += 1
        
    # 2. Key Stream (Initialize AFTER adjustment)
    # Now keystream will use the IV state that produced the valid salt_prime
    keystream_gen = keystream_generator(IV) 

    route = salt_prime % 4
    determinant = salt_prime % 2
    randomindex = {1:2, 2:3, 0:5}.get(route, 7)
    
    # 5. Encryption Loop
    cipher_bytes = bytearray()
    counter = 1
    
    for byte_val in pesan_padded:
        current_kunci = next(keystream_gen)
        
        product = salt_prime * counter
        m = ((product ^ (product >> 16)) & 0xFF) | 1
        
        if determinant == 0:
            if counter % randomindex == 0:
                result = (byte_val - current_kunci * m) % 256
            else:
                result = (byte_val + current_kunci * m) % 256
        else:
            if counter % randomindex == 0:
                result = (byte_val + current_kunci * m) % 256
            else:
                result = (byte_val - current_kunci * m) % 256
                
        cipher_bytes.append(result)
        counter += 1
        
    # 6. Construct Binary Payload
    tag_bytes = b"".join(val.to_bytes(8, 'big') for val in tag_state)
    salt_bytes = b"".join(val.to_bytes(8, 'big') for val in Salt)
    
    return tag_bytes + salt_bytes + cipher_bytes

if __name__ == "__main__":
    print("\n[V3.4 - THESIS FINAL]")
    print("---------------------")
    pesan = input("Masukkan pesan: ")
    kunci = input("Masukkan kunci: ")
    
    start = time.perf_counter()
    output_bytes = encrypt_v3_4(pesan, kunci)
    end = time.perf_counter()
    
    output_hex = binascii.hexlify(output_bytes).decode('utf-8')
    
    print("\nOutput (Hex Representation of Bytes):")
    print(output_hex)
    print(f"\nTotal Bytes: {len(output_bytes)}")
    print(f"Waktu: {(end-start)*1000:.4f} ms")
